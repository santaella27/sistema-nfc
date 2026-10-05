const { Schema, model } = require("mongoose");

const STATUS = ["recebido", "em_preparo", "pronto", "entregue", "cancelado"];

// Item do pedido: guarda um "snapshot" do produto no momento da compra,
// assim mudar o preço/nome no cardápio não altera pedidos antigos.
const itemSchema = new Schema(
  {
    produto: { type: Schema.Types.ObjectId, ref: "Produto", required: true },
    nome: { type: String, required: true },
    precoUnitario: { type: Number, required: true, min: 0 }, // centavos
    quantidade: { type: Number, required: true, min: 1 },
    observacao: { type: String, trim: true, maxlength: 200 }, // ex.: "sem cebola"
  },
  { _id: false },
);

const historicoSchema = new Schema(
  {
    status: { type: String, enum: STATUS, required: true },
    em: { type: Date, default: Date.now },
    por: { type: Schema.Types.ObjectId, ref: "Usuario" }, // quem alterou (null = cliente)
  },
  { _id: false },
);

const pedidoSchema = new Schema(
  {
    restaurante: {
      type: Schema.Types.ObjectId,
      ref: "Restaurante",
      required: true,
    },
    // A sessão (comanda) é a referência principal: separa o histórico de cada cliente.
    sessao: { type: Schema.Types.ObjectId, ref: "SessaoMesa", required: true },
    // Cópia da mesa da sessão, só para facilitar listagens e o painel (evita um JOIN a mais).
    mesa: { type: Schema.Types.ObjectId, ref: "Mesa", required: true },
    itens: {
      type: [itemSchema],
      validate: [(v) => v.length > 0, "O pedido precisa ter ao menos um item"],
    },
    status: { type: String, enum: STATUS, default: "recebido" },
    historicoStatus: {
      type: [historicoSchema],
      default: () => [{ status: "recebido" }],
    },
    total: { type: Number, min: 0 }, // centavos, calculado automaticamente
    nomeCliente: { type: String, trim: true }, // opcional
    observacaoGeral: { type: String, trim: true, maxlength: 300 },
  },
  { timestamps: true },
);

// Calcula o total no servidor (nunca confie no total enviado pelo cliente)
pedidoSchema.pre("validate", function (next) {
  this.total = this.itens.reduce(
    (soma, i) => soma + i.precoUnitario * i.quantidade,
    0,
  );
  next();
});

// Registra mudanças de status no histórico
pedidoSchema.methods.alterarStatus = function (novoStatus, usuarioId) {
  this.status = novoStatus;
  this.historicoStatus.push({ status: novoStatus, por: usuarioId });
  return this.save();
};

// Painel da cozinha: pedidos ativos do restaurante, mais antigos primeiro
pedidoSchema.index({ restaurante: 1, status: 1, createdAt: 1 });
// Pedidos de uma comanda (acompanhamento do cliente e fechamento de conta)
pedidoSchema.index({ sessao: 1, status: 1 });
// Consultar pedidos de uma mesa
pedidoSchema.index({ mesa: 1, createdAt: -1 });

const Pedido = model("Pedido", pedidoSchema);
Pedido.STATUS = STATUS;

module.exports = Pedido;
