const router = require("express").Router();
const { isValidObjectId } = require("mongoose");
const { SessaoMesa, Pedido } = require("../models");
const { autenticar } = require("../middleware/auth");
const { salaDoRestaurante, salaDaSessao } = require("../socket");

// PATCH /api/sessoes/:id/fechar  -> "Fechar Conta / Liberar Mesa"
router.patch("/:id/fechar", autenticar, async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!isValidObjectId(id)) {
      return res.status(400).json({ erro: "ID de sessão inválido" });
    }

    // Validação de tenant: só encontra a sessão se ela for do restaurante do usuário logado
    const sessao = await SessaoMesa.findOne({
      _id: id,
      restaurante: req.usuario.restaurante,
    }).populate("mesa", "numero");
    if (!sessao) {
      return res.status(404).json({ erro: "Sessão não encontrada" });
    }

    // Idempotente: se outra tela já fechou, não é erro
    if (sessao.status !== "fechada") {
      sessao.status = "fechada";
      sessao.encerradaEm = new Date();
      sessao.encerradaPor = req.usuario.id;
      await sessao.save();

      const io = req.app.get("io");
      try {
        // Todas as telas da cozinha/caixa tiram a mesa da lista de atendimento
        io.to(salaDoRestaurante(String(req.usuario.restaurante))).emit(
          "sessao:fechada",
          {
            sessaoId: String(sessao._id),
            mesaNumero: sessao.mesa?.numero,
          },
        );
        // Celulares da mesa são avisados e depois removidos da sala (a comanda acabou)
        const sala = salaDaSessao(sessao._id);
        io.to(sala).emit("sessao:encerrada", { sessaoId: String(sessao._id) });
        io.in(sala).socketsLeave(sala);
      } catch (e) {
        console.error("Falha ao emitir eventos de sessão", e);
      }
    }

    // Resumo da conta (pedidos cancelados não entram)
    const [resumo] = await Pedido.aggregate([
      { $match: { sessao: sessao._id, status: { $ne: "cancelado" } } },
      {
        $group: { _id: null, total: { $sum: "$total" }, pedidos: { $sum: 1 } },
      },
    ]);

    res.json({
      sessaoId: String(sessao._id),
      status: sessao.status,
      mesa: { numero: sessao.mesa?.numero },
      iniciadaEm: sessao.iniciadaEm,
      encerradaEm: sessao.encerradaEm,
      total: resumo?.total ?? 0, // centavos
      pedidos: resumo?.pedidos ?? 0,
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
