/**
 * LA PASTILLE D'ENGAGEMENT D'UNE CONVERSATION (#8906) — « 🔥 4 · 120 (12) » :
 * son nom accessible, qui dit en mots la série et les points. Tranche du
 * catalogue `catalog-en.ts`, qu'il RÉPAND.
 */
const enEngagement = {
  'engagement.pill.streak.one': '{count}-day streak',
  'engagement.pill.streak.other': '{count}-day streak',
  'engagement.pill.points.one': '{total} point, {today} today',
  'engagement.pill.points.other': '{total} points, {today} today',
  'engagement.pill.total.one': '{total} point earned in this conversation',
  'engagement.pill.total.other': '{total} points earned in this conversation',
  'engagement.pill.join': '{streak}, {points}',
  'engagement.post.points.one': 'This post earned you {count} point',
  'engagement.post.points.other': 'This post earned you {count} points',
} as const;

export default enEngagement;
