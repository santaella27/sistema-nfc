const { Schema, model } = require("mongoose");
const { randomUUID } = require("crypto");

const mesaSchema = new Schema(
  {
    restaurante: {
      type: Schema.Types.ObjectId,
      ref: "Restaurante",
      required: true,
    },
    numero: { type: Number, required: true, min: 1 }, // número visível da mesa
    // ID único gravado na Tag NFC. A tag guarda uma URL, ex.: https://seuapp.com/m/<nfcId>
    // Use um valor não sequencial (UUID) para que ninguém adivinhe o ID de outras mesas.
    nfcId: {
      type: String,
      required: true,
      unique: true,
      default: () => randomUUID(),
      immutable: true,
    },
    descricao: { type: String, trim: true }, // ex.: "Varanda", "Salão 2"
    ativa: { type: Boolean, default: true },
  },
  { timestamps: true },
);

// Não pode haver duas mesas com o mesmo número no mesmo restaurante
mesaSchema.index({ restaurante: 1, numero: 1 }, { unique: true });

module.exports = model("Mesa", mesaSchema);
