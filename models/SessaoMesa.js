const { Schema, model } = require("mongoose");

const STATUS = ["aberta", "fechada"];

// Uma "comanda": começa quando o primeiro cliente abre a mesa e termina quando o caixa fecha a conta.
const sessaoMesaSchema = new Schema(
  {
    restaurante: {
      type: Schema.Types.ObjectId,
      ref: "Restaurante",
      required: true,
    },
    mesa: { type: Schema.Types.ObjectId, ref: "Mesa", required: true },
    status: { type: String, enum: STATUS, default: "aberta" },
    iniciadaEm: { type: Date, default: Date.now },
    encerradaEm: { type: Date },
    encerradaPor: { type: Schema.Types.ObjectId, ref: "Usuario" }, // quem fechou a conta
  },
  { timestamps: true },
);

// Regra garantida pelo próprio banco: no máximo UMA sessão aberta por mesa.
// Se dois celulares abrirem a mesa no mesmo instante, o segundo reaproveita a sessão do primeiro.
sessaoMesaSchema.index(
  { mesa: 1 },
  { unique: true, partialFilterExpression: { status: "aberta" } },
);
sessaoMesaSchema.index({ restaurante: 1, status: 1 });

// Retorna a sessão aberta da mesa; se não existir, cria uma na hora.
sessaoMesaSchema.statics.obterOuCriarAberta = async function (
  mesaId,
  restauranteId,
) {
  const filtro = { mesa: mesaId, status: "aberta" };
  try {
    return await this.findOneAndUpdate(
      filtro,
      { $setOnInsert: { restaurante: restauranteId, iniciadaEm: new Date() } },
      { upsert: true, new: true },
    );
  } catch (err) {
    if (err.code === 11000) return this.findOne(filtro); // outro celular criou no mesmo instante
    throw err;
  }
};

const SessaoMesa = model("SessaoMesa", sessaoMesaSchema);
SessaoMesa.STATUS = STATUS;

module.exports = SessaoMesa;
