const jwt = require("jsonwebtoken");

// Valida o header "Authorization: Bearer <token>" e preenche req.usuario.
// O restaurante do usuário vem SEMPRE do token assinado, nunca do body/query/params.
function autenticar(req, res, next) {
  const [tipo, token] = (req.headers.authorization || "").split(" ");
  if (tipo !== "Bearer" || !token) {
    return res.status(401).json({ erro: "Token ausente" });
  }
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET, {
      algorithms: ["HS256"],
    });
    req.usuario = {
      id: payload.sub,
      restaurante: payload.restaurante,
      papel: payload.papel,
    };
    next();
  } catch {
    res.status(401).json({ erro: "Token inválido ou expirado" });
  }
}

module.exports = { autenticar };
