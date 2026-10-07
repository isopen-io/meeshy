/**
 * LA PASTILLE D'ENGAGEMENT D'UNE CONVERSATION (#8906) — « 🔥 4 · 120 (12) » :
 * son nom accessible, qui dit en mots la série et les points. Tranche du
 * catalogue `catalog-fr.ts`, qu'il RÉPAND.
 *
 * Sans série en cours, le cumul seul (`engagement.pill.total.*`) ; et la
 * phrase qu'un post dit de ce qu'il a rapporté au lecteur
 * (`engagement.post.points.*`, #9570) — le jeu tutoie.
 */
const frEngagement = {
  'engagement.pill.streak.one': 'Série de {count} jour',
  'engagement.pill.streak.other': 'Série de {count} jours',
  'engagement.pill.points.one': '{total} point dont {today} aujourd’hui',
  'engagement.pill.points.other': '{total} points dont {today} aujourd’hui',
  'engagement.pill.total.one': '{total} point gagné dans cette conversation',
  'engagement.pill.total.other': '{total} points gagnés dans cette conversation',
  'engagement.pill.join': '{streak}, {points}',
  'engagement.pill.open': 'Ouvrir ma progression',
  'engagement.flame.label': '{count} points aujourd’hui — toucher pour masquer la flamme',
  'engagement.post.points.one': 'Ce post t’a rapporté {count} point',
  'engagement.post.points.other': 'Ce post t’a rapporté {count} points',
} as const;

export default frEngagement;
