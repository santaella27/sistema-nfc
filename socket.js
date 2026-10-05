const { Server } = require("socket.io");
const jwt = require("jsonwebtoken");
const { isValidObjectId } = require("mongoose");
const { Mesa, Pedido, SessaoMesa } = require("./models");

const salaDoRestaurante = (restauranteId) => `restaurante:${restauranteId}`;
const salaDaSessao = (sessaoId) => `sessao:${sessaoId}`;

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const STATUS_ATIVOS = ["recebido", "em_preparo", "pronto"];

const origensPermitidas = () =>
  process.env.CORS_ORIGIN
    ? process.env.CORS_ORIGIN.split(",").map((o) => o.trim())
    : true;

function iniciarSocket(httpServer) {
  const io = new Server(httpServer, { cors: { origin: origensPermitidas() } });

  // Autenticação OPCIONAL:
  // - com token  -> painel do restaurante (entra na sala do restaurante)
  // - sem token  -> cliente público do NFC (só pode acompanhar a própria comanda)
  // Token presente porém inválido continua sendo recusado.
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token;
    if (!token) {
      socket.data.usuario = null;
      return next();
    }
    try {
      const payload = jwt.verify(token, process.env.JWT_SECRET);
      socket.data.usuario = {
        id: payload.sub,
        restaurante: payload.restaurante,
        papel: payload.papel,
      };
      next();
    } catch {
      next(new Error("Token inválido"));
    }
  });

  io.on("connection", (socket) => {
    // Painel: a sala vem do token, nunca de algo enviado pelo cliente
    if (socket.data.usuario) {
      socket.join(salaDoRestaurante(socket.data.usuario.restaurante));
    }

    // Cliente público: pede para acompanhar a COMANDA da mesa.
    // Envia o UUID da tag (a "chave" da mesa) e o sessaoId que recebeu ao abrir a página.
    // ack({ ok, encerrada, pedidos }):
    //  - encerrada: true  -> a comanda que o celular conhece já foi fechada pelo caixa
    //  - pedidos          -> pedidos ativos da comanda (ressincroniza após queda de conexão/reload)
    socket.on("sessao:entrar", async (dados, ack) => {
      const responder = typeof ack === "function" ? ack : () => {};
      try {
        const { nfcId, sessaoId } = dados ?? {};
        if (typeof nfcId !== "string" || !UUID_REGEX.test(nfcId))
          return responder({ ok: false });
        if (typeof sessaoId !== "string" || !isValidObjectId(sessaoId))
          return responder({ ok: false });

        // Limite simples por conexão para ninguém usar o evento para martelar o banco
        socket.data.tentativas = (socket.data.tentativas || 0) + 1;
        if (socket.data.tentativas > 20) return responder({ ok: false });

        const mesa = await Mesa.findOne({ nfcId, ativa: true })
          .select("_id")
          .lean();
        if (!mesa) return responder({ ok: false });

        const sessao = await SessaoMesa.findOne({
          mesa: mesa._id,
          status: "aberta",
        })
          .select("_id")
          .lean();
        if (!sessao || String(sessao._id) !== sessaoId) {
          return responder({ ok: true, encerrada: true, pedidos: [] });
        }

        // Uma conexão acompanha uma comanda por vez
        for (const sala of [...socket.rooms]) {
          if (sala.startsWith("sessao:")) socket.leave(sala);
        }
        socket.join(salaDaSessao(sessao._id));

        const pedidos = await Pedido.find({
          sessao: sessao._id,
          status: { $in: STATUS_ATIVOS },
        })
          .select("status")
          .sort({ createdAt: 1 })
          .lean();

        responder({
          ok: true,
          encerrada: false,
          pedidos: pedidos.map((p) => ({
            id: String(p._id),
            status: p.status,
          })),
        });
      } catch (err) {
        console.error("Erro em sessao:entrar", err);
        responder({ ok: false });
      }
    });
  });

  return io;
}

module.exports = {
  iniciarSocket,
  salaDoRestaurante,
  salaDaSessao,
  origensPermitidas,
};
