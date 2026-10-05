const { Schema, model } = require("mongoose");
const bcrypt = require("bcryptjs");

const usuarioSchema = new Schema(
  {
    nome: { type: String, required: true, trim: true },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^\S+@\S+\.\S+$/, "E-mail inválido"],
    },
    // Guarda o hash; nunca é retornado nas queries por padrão
    senha: { type: String, required: true, minlength: 8, select: false },
    restaurante: {
      type: Schema.Types.ObjectId,
      ref: "Restaurante",
      required: true,
      index: true,
    },
    papel: {
      type: String,
      enum: ["dono", "gerente", "cozinha"],
      default: "dono",
    },
    ativo: { type: Boolean, default: true },
  },
  { timestamps: true },
);

// Faz o hash da senha sempre que ela for criada/alterada
usuarioSchema.pre("save", async function (next) {
  if (!this.isModified("senha")) return next();
  this.senha = await bcrypt.hash(this.senha, 12);
  next();
});

usuarioSchema.methods.verificarSenha = function (senhaPlana) {
  return bcrypt.compare(senhaPlana, this.senha); // buscar o usuário com .select('+senha')
};

module.exports = model("Usuario", usuarioSchema);
