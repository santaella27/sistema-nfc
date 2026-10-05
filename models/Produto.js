const { Schema, model } = require("mongoose");

const produtoSchema = new Schema(
  {
    restaurante: {
      type: Schema.Types.ObjectId,
      ref: "Restaurante",
      required: true,
    },
    nome: { type: String, required: true, trim: true },
    descricao: { type: String, trim: true, maxlength: 500 },
    // Preço em CENTAVOS (inteiro) para evitar erros de ponto flutuante. R$ 29,90 => 2990
    preco: { type: Number, required: true, min: 0, validate: Number.isInteger },
    categoria: { type: String, required: true, trim: true }, // ex.: "Bebidas", "Pratos principais"
    imagemUrl: { type: String },
    disponivel: { type: Boolean, default: true }, // permite "esgotar" o item sem apagar
    ordem: { type: Number, default: 0 }, // ordenação dentro da categoria
  },
  { timestamps: true },
);

// Listagem do cardápio: filtra por restaurante e categoria
produtoSchema.index({ restaurante: 1, categoria: 1, ordem: 1 });

module.exports = model("Produto", produtoSchema);
