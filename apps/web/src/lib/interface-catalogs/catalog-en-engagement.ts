/**
 * LA PASTILLE D'ENGAGEMENT D'UNE CONVERSATION (#8906) — « 🔥 4 · 120 (12) » :
 * son nom accessible, qui dit en mots la série et les points. Tranche du
 * catalogue `catalog-en.ts`, qu'il RÉPAND.
 */
const enEngagement = {
  'engagement.pill.streak.one': '{count}-day streak',
  'engagement.pill.streak.other': '{count}-day streak',
  'engagement.pill.points.one': '{total} spark, {today} today',
  'engagement.pill.points.other': '{total} sparks, {today} today',
  'engagement.pill.total.one': '{total} spark earned in this conversation',
  'engagement.pill.total.other': '{total} sparks earned in this conversation',
  'engagement.pill.join': '{streak}, {points}',
  'engagement.post.points.one': 'This post earned you {count} spark',
  'engagement.post.points.other': 'This post earned you {count} sparks',
} as const;

export default enEngagement;
