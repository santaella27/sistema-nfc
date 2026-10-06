require("dotenv").config();
const http = require("http");
const path = require("path");
const fs = require("fs");
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const helmet = require("helmet");
const { iniciarSocket, origensPermitidas } = require("./socket");
const { Restaurante, Mesa, Usuario } = require("./models");

for (const v of ["MONGO_URI", "JWT_SECRET"]) {
  if (!process.env[v])
    throw new Error(`Variável de ambiente ${v} não definida`);
}

const app = express();
app.set("trust proxy", 1);

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

// ATENÇÃO: não use express.static(__dirname). Isso publicaria server.js, seed.js, routes/ etc.
// As duas páginas HTML são entregues pelas rotas explícitas abaixo (e só elas).

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

  // Diagnóstico: as páginas HTML estão no deploy?
  for (const [nome, ficheiro] of Object.entries(PAGINAS)) {
    console.log(`[páginas] ${nome}: ${fs.existsSync(ficheiro) ? "OK" : "NÃO ENCONTRADO"}`);
  }

  mongoose
    .connect(process.env.MONGO_URI)
    .then(async () => {
      // Diagnóstico: em QUAL base o Render está conectado e o que existe nela?
      console.log(`Conectado ao MongoDB. Base: "${mongoose.connection.name}"`);
      const [r, m, u] = await Promise.all([
        Restaurante.countDocuments(),
        Mesa.countDocuments(),
        Usuario.countDocuments(),
      ]);
      console.log(`[base] restaurantes=${r} mesas=${m} usuarios=${u}`);
      if (m === 0) {
        console.warn(
          '[base] ATENÇÃO: nenhuma mesa nesta base. Confira o nome da base na MONGO_URI do Render ' +
            "(ex.: ...mongodb.net/NOME_DA_BASE?retryWrites=true...) ou rode 'npm run seed' apontando para ela.",
        );
      }
    })
    .catch((err) => console.error("Falha ao conectar no MongoDB:", err));
});