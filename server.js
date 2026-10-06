require("dotenv").config();
const http = require("http");
const path = require("path");
const fs = require("fs");
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const helmet = require("helmet");
const { iniciarSocket, origensPermitidas } = require("./socket");

for (const v of ["MONGO_URI", "JWT_SECRET"]) {
  if (!process.env[v])
    throw new Error(`Variável de ambiente ${v} não definida`);
}

const app = express();
app.set("trust proxy", 1);

// Rota de teste temporária para validar se o Render atualizou
app.get('/teste-servidor', (req, res) => {
  res.send('Servidor ativo e atualizado com sucesso!');
});

const server = http.createServer(app);

const io = iniciarSocket(server);
app.set("io", io);

app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: [
          "'self'",
          "'unsafe-inline'",
          "https://cdn.tailwindcss.com",
          "https://cdn.socket.io",
        ],
        styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
        fontSrc: ["https://fonts.gstatic.com"],
        imgSrc: ["'self'", "data:", "https://images.unsplash.com"],
        connectSrc: ["'self'", "ws:", "wss:"],
        upgradeInsecureRequests: null,
      },
    },
  }),
);
app.use(cors({ origin: origensPermitidas() }));
app.use(express.json({ limit: "50kb" }));

app.use(express.static(path.join(__dirname), { index: false }));

// API (JSON)
app.use("/api/auth", require("./routes/auth"));
app.use("/api/m", require("./routes/mesas"));
app.use("/api/pedidos", require("./routes/pedidos"));
app.use("/api/sessoes", require("./routes/sessoes"));

// Páginas HTML
const PAGINAS = {
  cliente: path.join(__dirname, "index.html"),
  painel: path.join(__dirname, "painel.html"),
};

const enviarPagina = (ficheiro) => (req, res, next) =>
  res.sendFile(ficheiro, (err) => {
    if (err) next(err);
  });

app.get("/", (req, res) => res.redirect("/painel"));
app.get("/m/:nfcId", enviarPagina(PAGINAS.cliente));
app.get("/painel", enviarPagina(PAGINAS.painel));

app.use((req, res) => res.status(404).json({ erro: "Rota não encontrada" }));

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ erro: "Erro interno do servidor" });
});

const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
  mongoose
    .connect(process.env.MONGO_URI)
    .then(() => console.log("Conectado ao MongoDB com sucesso!"))
    .catch((err) => console.error("Falha ao conectar no MongoDB:", err));
});