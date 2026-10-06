const router = require("express").Router();
const { Types } = require("mongoose");
const { Pedido } = require("../models");
const { autenticar } = require("../middleware/auth");

// O "dia" do restaurante é o dia no fuso do Brasil, e não o dia em UTC do servidor
// (o Render roda em UTC; sem isso, pedidos feitos depois das 21h cairiam no dia seguinte).
// Pode ser trocado com a variável de ambiente FUSO_HORARIO.
const FUSO = process.env.FUSO_HORARIO || "America/Sao_Paulo";

const DATA_REGEX = /^\d{4}-\d{2}-\d{2}$/;

// Formata uma data no fuso configurado como "YYYY-MM-DD"
function dataNoFuso(date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: FUSO,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

// Diferença (ms) entre o fuso configurado e UTC em um instante específico
function offsetDoFuso(instante) {
  const partes = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: FUSO,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    })
      .formatToParts(instante)
      .map((p) => [p.type, p.value]),
  );
  const comoUtc = Date.UTC(
    partes.year,
    partes.month - 1,
    partes.day,
    partes.hour,
    partes.minute,
    partes.second,
  );
  return comoUtc - Math.floor(instante.getTime() / 1000) * 1000;
}

// Meia-noite (no fuso configurado) de "YYYY-MM-DD", como Date em UTC
function inicioDoDia(dataStr) {
  const [a, m, d] = dataStr.split("-").map(Number);
  const meiaNoiteUtc = Date.UTC(a, m - 1, d);
  let inicio = meiaNoiteUtc - offsetDoFuso(new Date(meiaNoiteUtc));
  inicio = meiaNoiteUtc - offsetDoFuso(new Date(inicio)); // 2ª passada (horário de verão)
  return new Date(inicio);
}

// Soma 1 dia a "YYYY-MM-DD"
function diaSeguinte(dataStr) {
  const [a, m, d] = dataStr.split("-").map(Number);
  return new Date(Date.UTC(a, m - 1, d + 1)).toISOString().slice(0, 10);
}

// GET /api/relatorios/diario?data=YYYY-MM-DD   (data é opcional; padrão = hoje no fuso do restaurante)
// Considera só pedidos FINALIZADOS (status "entregue"). Valores em CENTAVOS.
router.get("/diario", autenticar, async (req, res, next) => {
  try {
    // Faturamento é informação sensível: a tela da cozinha não precisa dela
    if (!["dono", "gerente"].includes(req.usuario.papel)) {
      return res.status(403).json({ erro: "Sem permissão para ver relatórios" });
    }

    const data = req.query.data ?? dataNoFuso(new Date());
    if (typeof data !== "string" || !DATA_REGEX.test(data)) {
      return res.status(400).json({ erro: 'Parâmetro "data" inválido. Use YYYY-MM-DD' });
    }
    const inicio = inicioDoDia(data);
    const fim = inicioDoDia(diaSeguinte(data));
    if (Number.isNaN(inicio.getTime()) || dataNoFuso(inicio) !== data) {
      return res.status(400).json({ erro: 'Parâmetro "data" inválido' });
    }

    const [resultado] = await Pedido.aggregate([
      {
        $match: {
          // tenant vem do token (aggregate não faz cast automático para ObjectId)
          restaurante: new Types.ObjectId(req.usuario.restaurante),
          status: "entregue",
          createdAt: { $gte: inicio, $lt: fim },
        },
      },
      {
        $facet: {
          resumo: [
            {
              $group: {
                _id: null,
                faturamento: { $sum: "$total" },
                totalPedidos: { $sum: 1 },
              },
            },
          ],
          produtos: [
            { $sort: { createdAt: 1 } }, // para $last pegar o nome mais recente do produto
            { $unwind: "$itens" },
            {
              $group: {
                _id: "$itens.produto",
                nome: { $last: "$itens.nome" },
                quantidade: { $sum: "$itens.quantidade" },
                valorTotal: {
                  $sum: { $multiply: ["$itens.precoUnitario", "$itens.quantidade"] },
                },
              },
            },
            { $sort: { quantidade: -1, valorTotal: -1, nome: 1 } },
          ],
        },
      },
    ]);

    const base = resultado.resumo[0] ?? { faturamento: 0, totalPedidos: 0 };
    const produtos = resultado.produtos.map((p) => ({
      produtoId: String(p._id),
      nome: p.nome,
      quantidade: p.quantidade,
      valorTotal: p.valorTotal,
    }));

    res.json({
      data,
      fuso: FUSO,
      resumo: {
        faturamento: base.faturamento,
        totalPedidos: base.totalPedidos,
        ticketMedio: base.totalPedidos
          ? Math.round(base.faturamento / base.totalPedidos)
          : 0,
        itensVendidos: produtos.reduce((s, p) => s + p.quantidade, 0),
      },
      produtos,
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;