/**
 * LES TEXTES DE L'ONGLET JEU DES STATISTIQUES (#20618), CHARGÉS À LA DEMANDE —
 * hors du catalogue d'administration, que chaque écran de la console télécharge :
 * seul l'onglet « Jeu » les lit (`lib/admin/game-texts.ts`). Le français est la
 * source ; les trois autres langues portent exactement les mêmes clés.
 */
const f = {
  'admin.analytics.game.retention.title': 'Retour des nouveaux inscrits',
  'admin.analytics.game.retention.hint': 'Part des comptes d’une semaine d’inscription encore actifs 1, 7 et 30 jours après leur inscription. « — » : aucun compte de la semaine n’a encore eu le temps d’atteindre ce jour.',
  'admin.analytics.game.retention.column.week': 'Semaine du',
  'admin.analytics.game.retention.column.accounts': 'Inscrits',
  'admin.analytics.game.retention.column.day1': 'Après 1 jour',
  'admin.analytics.game.retention.column.day7': 'Après 7 jours',
  'admin.analytics.game.retention.column.day30': 'Après 30 jours',
  'admin.analytics.game.retention.empty.title': 'Aucune inscription sur les {weeks} dernières semaines',
  'admin.analytics.game.retention.empty.hint': 'Le retour se mesure dès qu’une semaine compte un nouvel inscrit.',
  'admin.analytics.game.daily.title': 'Le Jeu, jour par jour',
  'admin.analytics.game.daily.hint': 'Offrandes ouvertes et Meeshes frappées et dépensées chaque jour (UTC). Les Meeshes se comptent en unités.',
  'admin.analytics.game.daily.column.day': 'Jour',
  'admin.analytics.game.daily.column.offerings': 'Offrandes ouvertes',
  'admin.analytics.game.daily.column.minted': 'Meeshes frappées',
  'admin.analytics.game.daily.column.spent': 'Meeshes dépensées',
  'admin.analytics.game.today.title': 'Aujourd’hui',
  'admin.analytics.game.today.hint': 'Les joueurs qui entretiennent leur Flamme, et ceux qui ont mis le Jeu de côté.',
  'admin.analytics.game.longFlames': 'Flammes longues encore vivantes',
  'admin.analytics.game.longFlames.caption': 'Allumées depuis {days} jours ou plus.',
  'admin.analytics.game.hidden': 'Comptes en « Jeu masqué »',
  'admin.analytics.game.notificationsOff': 'Comptes sans notifications du Jeu',
  'admin.analytics.game.sampled': 'Lecture plafonnée : les chiffres sont des minorants.',
} as const;

export type GameStatsTextKey = keyof typeof f;

export default f;
