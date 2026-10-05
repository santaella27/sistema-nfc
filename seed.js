require("dotenv").config();
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const { Restaurante, Usuario, Mesa, Produto } = require("./models");

const BASE_URL =
  process.env.BASE_URL || `http://localhost:${process.env.PORT || 3000}`;

const DONO = {
  nome: "Dono do Burguer",
  email: "teste@burguer.com",
  senha: "123456",
};

// UUIDs fixos e válidos (v4): as URLs de teste são sempre as mesmas
const MESAS = [
  {
    numero: 1,
    nfcId: "3f2b8c1e-7a4d-4e9b-9c1a-0b5d6e7f8a01",
    descricao: "Salão",
  },
  {
    numero: 2,
    nfcId: "3f2b8c1e-7a4d-4e9b-9c1a-0b5d6e7f8a02",
    descricao: "Salão",
  },
  {
    numero: 3,
    nfcId: "3f2b8c1e-7a4d-4e9b-9c1a-0b5d6e7f8a03",
    descricao: "Varanda",
  },
];

// Preços em CENTAVOS (inteiros): 2890 = R$ 28,90
const PRODUTOS = [
  {
    nome: "X-Burguer Clássico",
    descricao: "Blend 160g, queijo prato, alface, tomate e molho da casa.",
    preco: 2890,
    categoria: "Hambúrgueres",
    ordem: 1,
    imagemUrl:
      "https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=300&q=70&auto=format&fit=crop",
  },
  {
    nome: "X-Bacon Duplo",
    descricao:
      "Dois blends 160g, cheddar, bacon crocante e cebola caramelizada.",
    preco: 3690,
    categoria: "Hambúrgueres",
    ordem: 2,
    imagemUrl:
      "https://images.unsplash.com/photo-1550547660-d9450f859349?w=300&q=70&auto=format&fit=crop",
  },
  {
    nome: "Batata Frita",
    descricao: "Porção crocante para dividir, com sal e páprica.",
    preco: 1790,
    categoria: "Acompanhamentos",
    ordem: 1,
    imagemUrl:
      "https://images.unsplash.com/photo-1573080496219-bb080dd4f877?w=300&q=70&auto=format&fit=crop",
  },
  {
    nome: "Refrigerante Lata",
    descricao: "Lata 350 ml, bem gelada.",
    preco: 790,
    categoria: "Bebidas",
    ordem: 1,
    imagemUrl: null,
  },
];

async function main() {
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "Seed bloqueado em produção (cria um usuário com senha fraca).",
    );
  }
  if (!process.env.MONGO_URI)
    throw new Error("MONGO_URI não definida. Configure o arquivo .env");

  await mongoose.connect(process.env.MONGO_URI);
  console.log("Conectado ao MongoDB. Criando dados de teste...\n");

  // 1) Restaurante (idempotente: usa o slug como chave)
  const restaurante = await Restaurante.findOneAndUpdate(
    { slug: "burguer-e-cia" },
    { $set: { nome: "Burguer & Cia", ativo: true } },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );

  // 2) Dono. O hash é feito aqui e a gravação usa findOneAndUpdate porque o model
  //    exige senha com 8+ caracteres no save() e "123456" não passaria nessa validação.
  const senhaHash = await bcrypt.hash(DONO.senha, 12);
  await Usuario.findOneAndUpdate(
    { email: DONO.email },
    {
      $set: {
        nome: DONO.nome,
        senha: senhaHash,
        restaurante: restaurante._id,
        papel: "dono",
        ativo: true,
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );

  // 3) Mesas (nfcId é imutável, então só é gravado na criação)
  const mesas = [];
  for (const m of MESAS) {
    let mesa = await Mesa.findOne({
      restaurante: restaurante._id,
      numero: m.numero,
    });
    if (!mesa) mesa = await Mesa.create({ restaurante: restaurante._id, ...m });
    else if (!mesa.ativa) {
      mesa.ativa = true;
      await mesa.save();
    }
    mesas.push(mesa);
  }

  // 4) Produtos
  for (const p of PRODUTOS) {
    await Produto.findOneAndUpdate(
      { restaurante: restaurante._id, nome: p.nome },
      { $set: { ...p, restaurante: restaurante._id, disponivel: true } },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );
  }

  console.log("Seed concluído!\n");
  console.log(`Restaurante: ${restaurante.nome}`);
  console.log(`Login do painel: ${DONO.email} / ${DONO.senha}\n`);
  console.log("Mesas (URLs do cliente):");
  for (const mesa of mesas) {
    console.log(
      `  Mesa ${String(mesa.numero).padStart(2, "0")}: ${BASE_URL}/m/${mesa.nfcId}`,
    );
  }
  console.log(`\nPainel da cozinha: ${BASE_URL}/painel`);
  console.log(`Teste rápido da API: ${BASE_URL}/api/m/${mesas[0].nfcId}`);
}

main()
  .catch((err) => {
    console.error("Erro no seed:", err.message);
    process.exitCode = 1;
  })
  .finally(() => mongoose.disconnect());
