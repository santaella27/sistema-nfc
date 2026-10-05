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

const server = http.createServer(app);

// Socket.io compartilha o mesmo servidor HTTP e fica acessível nas rotas via req.app.get('io')
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
        upgradeInsecureRequests: null, // evita quebrar testes em http://localhost
      },
    },
  }),
);
app.use(cors({ origin: origensPermitidas() }));
app.use(express.json({ limit: "50kb" }));
app.use(express.static(path.join(__dirname)));

// API (JSON)
app.use("/api/auth", require("./routes/auth"));
app.use("/api/m", require("./routes/mesas"));
app.use("/api/pedidos", require("./routes/pedidos"));
app.use("/api/sessoes", require("./routes/sessoes"));

// ---------- Páginas HTML ----------
const PAGINAS = {
  cliente: path.join(__dirname, "index.html"),
  painel: path.join(__dirname, "painel.html"),
};

// Diagnóstico no arranque (aparece nos Logs do Render)
for (const [nome, ficheiro] of Object.entries(PAGINAS)) {
  console.log(
    `[páginas] ${nome}: ${ficheiro} -> ${fs.existsSync(ficheiro) ? "OK" : "NÃO ENCONTRADO"}`,
  );
}
console.log(
  "[páginas] ficheiros na pasta:",
  fs.readdirSync(__dirname).join(", "),
);

const enviarPagina = (ficheiro) => (req, res, next) =>
  res.sendFile(ficheiro, (err) => {
    if (err) {
      console.error(`Falha ao enviar ${ficheiro}:`, err.message);
      next(err);
    }
  });

app.get("/m/:nfcId", enviarPagina(PAGINAS.cliente));
app.get("/painel", enviarPagina(PAGINAS.painel));

app.use((req, res) => res.status(404).json({ erro: "Rota não encontrada" }));

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ erro: "Erro interno do servidor" });
});

const PORT = process.env.PORT || 3000;

// Inicia o servidor web imediatamente para o Render detetar a porta
server.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);

  // Tenta ligar à base de dados em segundo plano
  mongoose
    .connect(process.env.MONGO_URI)
    .then(() => console.log("Conectado ao MongoDB com sucesso!"))
    .catch((err) => console.error("Falha ao conectar no MongoDB:", err));
});
