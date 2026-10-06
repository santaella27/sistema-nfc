// Rode UMA vez (npm run migrar:sessoes) se você já tinha pedidos criados antes das sessões.
// Para cada mesa, cria uma sessão JÁ FECHADA com o histórico antigo, e liga os pedidos a ela.
require('dotenv').config();
const mongoose = require('mongoose');
const { Pedido, SessaoMesa } = require('../models');

async function main() {
  if (!process.env.MONGO_URI) throw new Error('MONGO_URI não definida. Configure o arquivo .env');
  await mongoose.connect(process.env.MONGO_URI);

  const grupos = await Pedido.aggregate([
    { $match: { sessao: { $exists: false } } },
    {
      $group: {
        _id: '$mesa',
        restaurante: { $first: '$restaurante' },
        inicio: { $min: '$createdAt' },
        fim: { $max: '$createdAt' },
        qtd: { $sum: 1 },
      },
    },
  ]);

  if (grupos.length === 0) {
    console.log('Nenhum pedido antigo para migrar.');
    return;
  }

  for (const g of grupos) {
    const sessao = await SessaoMesa.create({
      restaurante: g.restaurante,
      mesa: g._id,
      status: 'fechada',
      iniciadaEm: g.inicio,
      encerradaEm: g.fim,
    });
    await Pedido.updateMany({ mesa: g._id, sessao: { $exists: false } }, { $set: { sessao: sessao._id } });
    console.log(`Mesa ${g._id}: ${g.qtd} pedido(s) ligados à sessão ${sessao._id}`);
  }
  console.log('Migração concluída.');
}

main()
  .catch((err) => {
    console.error('Erro na migração:', err.message);
    process.exitCode = 1;
  })
  .finally(() => mongoose.disconnect());