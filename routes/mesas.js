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
        baseConectada: Mesa.db.name,
        mesaExisteSemFiltro: !!bruta,
        ativaNoBanco: bruta?.ativa,
        restauranteNoDoc: bruta?.restaurante ? String(bruta.restaurante) : null,
        restauranteResolvido: !!mesa?.restaurante,
        restauranteAtivo: mesa?.restaurante?.ativo,
      });
      return res.status(404).json({ erro: "Mesa não encontrada" });
    }

    // Sessao da mesa
    const sessao = await SessaoMesa.obterOuCriarAberta(
      mesa._id,
      mesa.restaurante._id
    );

    const produtos = await Produto.find({
      restaurante: mesa.restaurante._id,
      disponivel: true,
    })
      .sort({ categoria: 1, ordem: 1, nome: 1 })
      .lean();

    const porCategoria = new Map();
    for (const p of produtos) {
      if (!porCategoria.has(p.categoria)) porCategoria.set(p.categoria, []);
      porCategoria.get(p.categoria).push({
        id: p._id,
        nome: p.nome,
        descricao: p.descricao,
        preco: p.preco,
        imagemUrl: p.imagemUrl,
      });
    }

    res.json({
      restaurante: {
        id: mesa.restaurante._id,
        nome: mesa.restaurante.nome,
        slug: mesa.restaurante.slug,
        logoUrl: mesa.restaurante.logoUrl,
      },
      mesa: {
        id: mesa._id,
        numero: mesa.numero,
        descricao: mesa.descricao,
      },
      sessaoId: String(sessao._id),
      cardapio: [...porCategoria].map(([categoria, itens]) => ({
        categoria,
        produtos: itens,
      })),
    });
  } catch (err) {
    next(err);
  }
});