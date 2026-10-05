const router = require("express").Router();
const jwt = require("jsonwebtoken");
const rateLimit = require("express-rate-limit");
const { Usuario } = require("../models");

const limitadorLogin = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { erro: "Muitas tentativas de login. Tente novamente mais tarde." },
});

// POST /api/auth/login  -> { email, senha }
router.post("/login", limitadorLogin, async (req, res, next) => {
  try {
    const { email, senha } = req.body ?? {};
    if (typeof email !== "string" || typeof senha !== "string") {
      return res.status(400).json({ erro: "Informe e-mail e senha" });
    }

    const usuario = await Usuario.findOne({
      email: email.toLowerCase().trim(),
      ativo: true,
    })
      .select("+senha")
      .populate("restaurante", "nome ativo");

    if (!usuario || !(await usuario.verificarSenha(senha))) {
      return res.status(401).json({ erro: "Credenciais inválidas" });
    }

    const restaurante = usuario.restaurante; // já populado
    if (!restaurante || !restaurante.ativo) {
      return res
        .status(403)
        .json({ erro: "Restaurante inativo ou não encontrado" });
    }

    const token = jwt.sign(
      { restaurante: String(restaurante._id), papel: usuario.papel },
      process.env.JWT_SECRET,
      { subject: String(usuario._id), expiresIn: "12h" },
    );

    res.json({
      token,
      usuario: {
        id: usuario._id,
        nome: usuario.nome,
        papel: usuario.papel,
        restaurante: String(restaurante._id),
      },
      restaurante: { nome: restaurante.nome },
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
