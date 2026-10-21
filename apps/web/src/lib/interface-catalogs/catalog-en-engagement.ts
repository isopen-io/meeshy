/**
 * LA PASTILLE D'ENGAGEMENT D'UNE CONVERSATION (#8906) — « 🔥 4 · 120 (12) » :
 * son nom accessible, qui dit en mots la série et les points. Tranche du
 * catalogue `catalog-en.ts`, qu'il RÉPAND.
 */
const enEngagement = {
  'engagement.pill.streak.one': '{count}-day Flame',
  'engagement.pill.streak.other': '{count}-day Flame',
  'engagement.pill.points.one': '{total} spark, {today} today',
  'engagement.pill.points.other': '{total} sparks, {today} today',
  'engagement.pill.total.one': '{total} spark earned in this conversation',
  'engagement.pill.total.other': '{total} sparks earned in this conversation',
  'engagement.pill.join': '{streak}, {points}',
  'engagement.post.points.one': 'This post made {count} spark fly for you',
  'engagement.post.points.other': 'This post made {count} sparks fly for you',
} as const;

export default enEngagement;
