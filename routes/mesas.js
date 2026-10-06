const router = require("express").Router();
const { Mesa, Produto, SessaoMesa } = require("../models");

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// GET /api/m/:nfcId  -> chamada pelo front quando o cliente aproxima o celular da tag NFC
router.get("/:nfcId", async (req, res, next) => {
  try {
    const { nfcId } = req.params;

    if (!UUID_REGEX.test(nfcId)) {
      return res.status(400).json({ erro: "Código da mesa inválido" });
    }

    const mesa = await Mesa.findOne({ nfcId, ativa: true }).populate("restaurante");

    if (!mesa || !mesa.restaurante || !mesa.restaurante.ativo) {
      const bruta = await Mesa.findOne({ nfcId }).lean();
      console.warn('[GET /api/m 404 DIAGNOSTICO]', {
        nfcId,
        baseConectada: Mesa.db.name,
        mesaExisteSemFiltro: !!bruta,
        ativaNoBanco: bruta?.ativa,
        restauranteNoDoc: bruta?.restaurante ? String(bruta.restaurante) : null,
        restauranteResolvido: !!mesa?.restaurante,
        restauranteAtivo: mesa?.restaurante?.ativo,
      });
      return res.status(404).json({ erro: "Mesa não encontrada" });
    }

    // Comanda da mesa: usa a sessão aberta atual ou cria uma nova se a mesa estiver livre
    const sessao = await SessaoMesa.obterOuCriarAberta(
      mesa._id,
      mesa.restaurante._id
    );

    const produtos = await Produto.find({
      restaurante: mesa.restaurante._id,
      disponivel: true,
    })
      .sort({ categoria: 1, ordem: 1, nome: 1 })
      .lean();

    // Agrupa por categoria para o front renderizar o cardápio direto
    const porCategoria = new Map();
    for (const p of produtos) {
      if (!porCategoria.has(p.categoria)) porCategoria.set(p.categoria, []);
      porCategoria.get(p.categoria).push({
        id: p._id,
        nome: p.nome,
        descricao: p.descricao,
        preco: p.preco, // centavos
        imagemUrl: p.imagemUrl,
      });
    }

    res.json({
      restaurante: {
        id: mesa.restaurante._id,
        nome: mesa.restaurante.nome,
        slug: mesa.restaurante.slug,
        logoUrl: mesa.restaurante.logoUrl,
      },
      mesa: {
        id: mesa._id,
        numero: mesa.numero,
        descricao: mesa.descricao,
      },
      sessaoId: String(sessao._id), // é este valor que o front envia como "sessaoId" no POST /api/pedidos
      cardapio: [...porCategoria].map(([categoria, itens]) => ({
        categoria,
        produtos: itens,
      })),
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;