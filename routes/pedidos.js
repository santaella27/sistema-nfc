const router = require("express").Router();
const rateLimit = require("express-rate-limit");
const { isValidObjectId } = require("mongoose");
const { Produto, Pedido, SessaoMesa } = require("../models");
const { salaDoRestaurante, salaDaSessao } = require("../socket");
const { autenticar } = require("../middleware/auth");
const { serializarPedido } = require("../utils/serializarPedido");

// A rota é pública (o cliente não faz login), então limitamos o spam por IP
const limitador = rateLimit({
  windowMs: 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { erro: "Muitos pedidos em pouco tempo. Aguarde um instante." },
});

const idValido = (v) => typeof v === "string" && isValidObjectId(v);
const textoOpcional = (v, max) =>
  typeof v === "string" && v.trim() ? v.trim().slice(0, max) : undefined;

// POST /api/pedidos
// Body: { sessaoId, itens: [{ produtoId, quantidade, observacao? }], nomeCliente?, observacaoGeral? }
router.post("/", limitador, async (req, res, next) => {
  try {
    const { sessaoId, itens, nomeCliente, observacaoGeral } = req.body ?? {};

    // 1) Validação do formato da requisição
    if (!idValido(sessaoId)) {
      return res.status(400).json({ erro: "sessaoId inválido" });
    }
    if (!Array.isArray(itens) || itens.length === 0 || itens.length > 50) {
      return res.status(400).json({ erro: "Envie entre 1 e 50 itens" });
    }
    for (const i of itens) {
      if (!idValido(i?.produtoId)) {
        return res
          .status(400)
          .json({ erro: "produtoId inválido em um dos itens" });
      }
      if (
        !Number.isInteger(i.quantidade) ||
        i.quantidade < 1 ||
        i.quantidade > 99
      ) {
        return res
          .status(400)
          .json({ erro: "Quantidade deve ser um inteiro entre 1 e 99" });
      }
    }

    // 2) A comanda precisa existir e estar ABERTA. Mesa e restaurante vêm dela.
    const sessao = await SessaoMesa.findById(sessaoId)
      .populate("mesa", "numero descricao ativa")
      .populate("restaurante", "ativo");
    if (!sessao || !sessao.mesa || !sessao.restaurante) {
      return res.status(404).json({ erro: "Comanda não encontrada" });
    }
    if (sessao.status !== "aberta") {
      return res.status(409).json({
        erro: "Esta comanda foi encerrada. Aproxime o celular da tag da mesa para iniciar uma nova.",
        codigo: "SESSAO_ENCERRADA",
      });
    }
    if (!sessao.mesa.ativa || !sessao.restaurante.ativo) {
      return res.status(404).json({ erro: "Mesa não encontrada" });
    }
    const mesa = sessao.mesa;
    const restauranteId = sessao.restaurante._id;

    // 3) Busca os produtos NO BANCO. Filtra pelo restaurante da comanda, assim ninguém
    //    consegue pedir produto de outro restaurante. Preços do front são ignorados.
    const idsUnicos = [...new Set(itens.map((i) => i.produtoId))];
    const produtos = await Produto.find({
      _id: { $in: idsUnicos },
      restaurante: restauranteId,
      disponivel: true,
    }).lean();
    const produtoPorId = new Map(produtos.map((p) => [String(p._id), p]));

    const indisponiveis = idsUnicos.filter((id) => !produtoPorId.has(id));
    if (indisponiveis.length > 0) {
      return res.status(422).json({
        erro: "Alguns produtos não estão disponíveis",
        produtosIndisponiveis: indisponiveis,
      });
    }

    // 4) Monta os itens com snapshot de nome e preço (em centavos)
    const itensPedido = itens.map((i) => {
      const p = produtoPorId.get(i.produtoId);
      return {
        produto: p._id,
        nome: p.nome,
        precoUnitario: p.preco,
        quantidade: i.quantidade,
        observacao: textoOpcional(i.observacao, 200),
      };
    });

    // 5) Salva. O total é calculado pelo hook pre('validate') do model Pedido.
    const pedido = await Pedido.create({
      restaurante: restauranteId,
      sessao: sessao._id,
      mesa: mesa._id,
      itens: itensPedido,
      status: "recebido",
      nomeCliente: textoOpcional(nomeCliente, 80),
      observacaoGeral: textoOpcional(observacaoGeral, 300),
    });

    // 6) Só depois de salvar com sucesso: avisa o painel e os celulares da comanda.
    //    Se o emit falhar, o pedido já está salvo, então não derrubamos a resposta.
    const payload = {
      ...serializarPedido(pedido, mesa),
      sessaoStatus: "aberta",
    };
    try {
      const io = req.app.get("io");
      io.to(salaDoRestaurante(String(restauranteId))).emit(
        "pedido:novo",
        payload,
      );
      io.to(salaDaSessao(sessao._id)).emit("status:atualizado", {
        pedidoId: payload.id,
        status: payload.status,
        atualizadoEm: payload.atualizadoEm,
      });
    } catch (e) {
      console.error("Falha ao emitir pedido:novo", e);
    }

    res.status(201).json({
      pedidoId: pedido._id,
      status: pedido.status,
      total: pedido.total, // centavos
      itens: pedido.itens,
      mesa: { numero: mesa.numero },
    });
  } catch (err) {
    if (err.name === "ValidationError") {
      return res.status(400).json({ erro: err.message });
    }
    next(err);
  }
});

/* ================= Rotas protegidas (painel do restaurante) ================= */

const STATUS_ATIVOS = ["recebido", "em_preparo", "pronto"];

// Fluxo permitido do Kanban. "entregue" e "cancelado" são estados finais.
const TRANSICOES = {
  recebido: ["em_preparo", "cancelado"],
  em_preparo: ["pronto", "cancelado"],
  pronto: ["entregue", "cancelado"],
  entregue: [],
  cancelado: [],
};

// GET /api/pedidos?status=recebido,em_preparo,pronto&desde=2026-10-01T00:00:00Z
// - status: lista separada por vírgula (padrão: recebido, em_preparo, pronto)
// - desde: só pedidos criados a partir dessa data (padrão: últimas 24h)
router.get("/", autenticar, async (req, res, next) => {
  try {
    const bruto = []
      .concat(req.query.status ?? [])
      .filter((s) => typeof s === "string")
      .join(",");
    const lista = [
      ...new Set(
        bruto
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
      ),
    ];
    const status = lista.length ? lista : STATUS_ATIVOS;

    const invalidos = status.filter((s) => !Pedido.STATUS.includes(s));
    if (invalidos.length) {
      return res
        .status(400)
        .json({
          erro: `Status inválido: ${invalidos.join(", ")}`,
          validos: Pedido.STATUS,
        });
    }

    const desde = req.query.desde
      ? new Date(req.query.desde)
      : new Date(Date.now() - 24 * 60 * 60 * 1000);
    if (Number.isNaN(desde.getTime())) {
      return res.status(400).json({ erro: 'Parâmetro "desde" inválido' });
    }

    const pedidos = await Pedido.find({
      restaurante: req.usuario.restaurante, // tenant vem do token
      status: { $in: status },
      createdAt: { $gte: desde },
    })
      .sort({ createdAt: -1 })
      .limit(300)
      .populate("mesa", "numero descricao")
      .populate("sessao", "status")
      .lean();

    res.json(pedidos.map((p) => serializarPedido(p)));
  } catch (err) {
    next(err);
  }
});

// PATCH /api/pedidos/:id/status   Body: { status }
router.patch("/:id/status", autenticar, async (req, res, next) => {
  try {
    const { id } = req.params;
    const novoStatus = req.body?.status;

    if (!isValidObjectId(id)) {
      return res.status(400).json({ erro: "ID de pedido inválido" });
    }
    if (typeof novoStatus !== "string" || !Pedido.STATUS.includes(novoStatus)) {
      return res
        .status(400)
        .json({ erro: "Status inválido", validos: Pedido.STATUS });
    }

    // Validação de tenant: só encontra o pedido se ele for do restaurante do usuário logado.
    // Pedido de outro restaurante responde 404 (não revela que ele existe).
    const pedido = await Pedido.findOne({
      _id: id,
      restaurante: req.usuario.restaurante,
    }).populate("mesa", "numero descricao");
    if (!pedido) {
      return res.status(404).json({ erro: "Pedido não encontrado" });
    }

    // Idempotente: duas telas clicando ao mesmo tempo não geram erro nem evento duplicado
    if (pedido.status === novoStatus) {
      return res.json(serializarPedido(pedido));
    }

    if (!TRANSICOES[pedido.status].includes(novoStatus)) {
      return res.status(409).json({
        erro: `Não é possível mover o pedido de "${pedido.status}" para "${novoStatus}"`,
        statusAtual: pedido.status,
      });
    }

    await pedido.alterarStatus(novoStatus, req.usuario.id); // salva e registra no historicoStatus

    // Avisa as telas da cozinha (completo) e os celulares da comanda (só o essencial).
    // Se o emit falhar, o status já foi salvo.
    const payload = serializarPedido(pedido);
    try {
      const io = req.app.get("io");
      io.to(salaDoRestaurante(String(req.usuario.restaurante))).emit(
        "pedido:atualizado",
        payload,
      );
      io.to(salaDaSessao(payload.sessaoId)).emit("status:atualizado", {
        pedidoId: payload.id,
        status: payload.status,
        atualizadoEm: payload.atualizadoEm,
      });
    } catch (e) {
      console.error("Falha ao emitir eventos de status", e);
    }

    res.json(payload);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
