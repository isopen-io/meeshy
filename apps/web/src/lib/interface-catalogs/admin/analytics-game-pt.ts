import type { GameStatsTextKey } from './analytics-game-fr';

const f = {
  'admin.analytics.game.retention.title': 'Retorno dos novos inscritos',
  'admin.analytics.game.retention.hint': 'Parte das contas de uma semana de inscrição ainda ativas 1, 7 e 30 dias após a inscrição. «—»: nenhuma conta dessa semana teve ainda tempo de chegar a esse dia.',
  'admin.analytics.game.retention.column.week': 'Semana de',
  'admin.analytics.game.retention.column.accounts': 'Inscritos',
  'admin.analytics.game.retention.column.day1': 'Após 1 dia',
  'admin.analytics.game.retention.column.day7': 'Após 7 dias',
  'admin.analytics.game.retention.column.day30': 'Após 30 dias',
  'admin.analytics.game.retention.empty.title': 'Nenhuma inscrição nas últimas {weeks} semanas',
  'admin.analytics.game.retention.empty.hint': 'O retorno é medido assim que uma semana tem um novo inscrito.',
  'admin.analytics.game.daily.title': 'O Jogo, dia a dia',
  'admin.analytics.game.daily.hint': 'Oferendas abertas e Meeshes cunhadas e gastas por dia (UTC). As Meeshes contam-se em unidades.',
  'admin.analytics.game.daily.column.day': 'Dia',
  'admin.analytics.game.daily.column.offerings': 'Oferendas abertas',
  'admin.analytics.game.daily.column.minted': 'Meeshes cunhadas',
  'admin.analytics.game.daily.column.spent': 'Meeshes gastas',
  'admin.analytics.game.today.title': 'Hoje',
  'admin.analytics.game.today.hint': 'Os jogadores que mantêm a sua Chama, e os que deixaram o Jogo de lado.',
  'admin.analytics.game.longFlames': 'Chamas longas ainda vivas',
  'admin.analytics.game.longFlames.caption': 'Acesas há {days} dias ou mais.',
  'admin.analytics.game.hidden': 'Contas com o Jogo oculto',
  'admin.analytics.game.notificationsOff': 'Contas sem notificações do Jogo',
  'admin.analytics.game.sampled': 'Leitura limitada: os números são mínimos.',
} satisfies Readonly<Record<GameStatsTextKey, string>>;

export default f;
