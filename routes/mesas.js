router.get("/:nfcId", async (req, res, next) => {
  try {
    const { nfcId } = req.params;

    if (!UUID_REGEX.test(nfcId)) {
      return res.status(400).json({ erro: "Código da mesa inválido" });
    }

    const mesa = await Mesa.findOne({ nfcId, ativa: true }).populate("restaurante");

    if (!mesa || !mesa.restaurante || !mesa.restaurante.ativo) {
      const bruta = await Mesa.findOne({ nfcId }).lean();
      console.warn('[GET /api/m 404 DIAGNOSTICO]', {
        nfcId,
        baseConectada: Mesa.db.name,                 // Confirma se está na base certa
        mesaExisteSemFiltro: !!bruta,
        ativaNoBanco: bruta?.ativa,
        restauranteNoDoc: bruta?.restaurante ? String(bruta.restaurante) : null,
        restauranteResolvido: !!mesa?.restaurante,
        restauranteAtivo: mesa?.restaurante?.ativo,
      });
      return res.status(404).json({ erro: "Mesa não encontrada" });
    }

    // ... (deixa o resto da função como está)