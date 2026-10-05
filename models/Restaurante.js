const { Schema, model } = require('mongoose');

const restauranteSchema = new Schema(
  {
    nome: { type: String, required: true, trim: true },
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
    telefone: { type: String, trim: true },
    logoUrl: { type: String },
    ativo: { type: Boolean, default: true },
  },
  { timestamps: true }
);

module.exports = model('Restaurante', restauranteSchema);