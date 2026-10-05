// Converte um pedido (documento Mongoose ou objeto lean) no formato que o painel consome.
// É o mesmo formato em GET /api/pedidos, PATCH, e nos eventos pedido:novo / pedido:atualizado.
function serializarPedido(p, mesa = p.mesa) {
  const mesaPopulada = mesa && mesa.numero !== undefined;
  const sessaoPopulada = p.sessao && p.sessao.status !== undefined;
  return {
    id: String(p._id),
    sessaoId: String(sessaoPopulada ? p.sessao._id : p.sessao),
    sessaoStatus: sessaoPopulada ? p.sessao.status : undefined,
    mesa: mesaPopulada
      ? { id: String(mesa._id), numero: mesa.numero, descricao: mesa.descricao }
      : { id: String(mesa) },
    itens: p.itens.map((i) => ({
      produto: String(i.produto),
      nome: i.nome,
      precoUnitario: i.precoUnitario,
      quantidade: i.quantidade,
      observacao: i.observacao,
    })),
    total: p.total,
    status: p.status,
    nomeCliente: p.nomeCliente,
    observacaoGeral: p.observacaoGeral,
    criadoEm: p.createdAt,
    atualizadoEm: p.updatedAt,
  };
}

module.exports = { serializarPedido };
