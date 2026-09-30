/**
 * LE FRAGMENT « engagement-scale » DU CATALOGUE D’ADMINISTRATION (#8906) — le
 * barème de points (`admin.scale.`) : ce que chaque geste rapporte, le
 * multiplicateur et ses plafonds par niveau. Préfixe exclusif : voir
 * `admin-catalog-fragments.test.ts`.
 *
 * Le français est la SOURCE de ses clés ; chaque autre langue les reprend. La
 * clé de menu `admin.nav.engagementScale` (et son `.hint`) reste dans la base,
 * avec les autres entrées `admin.nav.*`.
 */
const f = {
  'admin.scale.title': 'Barème de points',
  'admin.scale.denied': 'Ce réglage est réservé aux administrateurs.',
  'admin.scale.loadFailed': 'Le barème n’a pas pu être chargé.',
  'admin.scale.retry': 'Réessayer',
  'admin.scale.updated': 'Réglé le {date} par {by}',
  'admin.scale.defaults': 'Barème par défaut — jamais réglé.',
  'admin.scale.operations.title': 'Opérations',
  'admin.scale.col.operation': 'Opération',
  'admin.scale.col.points': 'Points',
  'admin.scale.col.multiplied': 'Multiplié',
  'admin.scale.col.cap': 'Plafond par conversation et par jour',
  'admin.scale.cap.none': 'Aucun',
  'admin.scale.pointsFor': 'Points — {operation}',
  'admin.scale.multipliedFor': 'Multiplié par l’élan — {operation}',
  'admin.scale.capFor': 'Plafond journalier — {operation}',
  'admin.scale.multiplier.title': 'Multiplicateur',
  'admin.scale.field.windowDays': 'Fenêtre glissante (jours)',
  'admin.scale.field.stepPerExtraFamily': 'Cran par famille supplémentaire',
  'admin.scale.field.standingBonus': 'Bonus d’assise',
  'admin.scale.field.achievementsForStanding': 'Succès pour l’assise',
  'admin.scale.field.highBadgeThreshold': 'Palier de badge élevé',
  'admin.scale.field.highBadgesForStanding': 'Badges élevés pour l’assise',
  'admin.scale.field.maxFactor': 'Multiplicateur maximal',
  'admin.scale.levels.title': 'Plafond par niveau',
  'admin.scale.col.minLevel': 'À partir du niveau',
  'admin.scale.col.maxFactor': 'Multiplicateur maximal',
  'admin.scale.levels.empty': 'Aucun plafond par niveau : le multiplicateur maximal vaut pour tous.',
  'admin.scale.levels.add': 'Ajouter un niveau',
  'admin.scale.levels.remove': 'Retirer le niveau {level}',
  'admin.scale.minLevelFor': 'Niveau minimal — ligne {row}',
  'admin.scale.maxFactorFor': 'Multiplicateur maximal — ligne {row}',
  'admin.scale.reset': 'Revenir aux défauts',
  'admin.scale.save': 'Enregistrer',
  'admin.scale.saving': 'Enregistrement…',
  'admin.scale.saved': 'Barème enregistré.',
  'admin.scale.invalid': 'Barème invalide : une valeur est hors bornes, un niveau est en double ou dépasse le multiplicateur maximal.',
  'admin.scale.saveFailed': 'Échec de l’enregistrement : {error}',
  'admin.scale.resetDone': 'Défauts rétablis — enregistrez pour les appliquer.',
} as const;

export default f;
