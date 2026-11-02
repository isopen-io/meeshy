/**
 * LES TEXTES DE L'ONGLET LECTURE DES STATISTIQUES (#11280), CHARGÉS À LA DEMANDE —
 * hors du catalogue d'administration, que chaque écran de la console télécharge :
 * seul l'onglet « Lecture » les lit (`lib/admin/playback-texts.ts`). Le français
 * est la source ; les trois autres langues portent exactement les mêmes clés.
 */
const f = {
  'admin.analytics.playback.title': 'Qualité de lecture',
  'admin.analytics.playback.hint': 'Temps jusqu’à la première image et rebuffer, médiane (p50) et 95e centile (p95), par jour, surface et gamme d’appareil.',
  'admin.analytics.playback.cells': 'Combinaisons servies',
  'admin.analytics.playback.suppressed': 'Combinaisons retenues',
  'admin.analytics.playback.suppressed.caption': 'Sous {count} comptes distincts, une combinaison n’est jamais montrée.',
  'admin.analytics.playback.sampled': 'Fenêtre plafonnée : les jours les plus anciens de la période sont incomplets.',
  'admin.analytics.playback.empty.title': 'Aucune mesure de lecture servie sur cette période',
  'admin.analytics.playback.empty.hint': 'Une combinaison n’apparaît qu’au-delà du seuil de comptes distincts.',
  'admin.analytics.playback.tier.low': 'Entrée de gamme',
  'admin.analytics.playback.tier.mid': 'Milieu de gamme',
  'admin.analytics.playback.tier.high': 'Haut de gamme',
  'admin.analytics.playback.tier.unknown': 'Non renseigné',
  'admin.analytics.playback.column.day': 'Jour',
  'admin.analytics.playback.column.surface': 'Surface',
  'admin.analytics.playback.column.tier': 'Appareil',
  'admin.analytics.playback.column.sessions': 'Sessions',
  'admin.analytics.playback.column.ttff.p50': 'Première image p50',
  'admin.analytics.playback.column.ttff.p95': 'Première image p95',
  'admin.analytics.playback.column.rebuffer.p50': 'Rebuffer p50',
  'admin.analytics.playback.column.rebuffer.p95': 'Rebuffer p95',
  'admin.analytics.playback.column.rebuffered': 'Sessions interrompues',
  'admin.analytics.playback.vitals.title': 'La page web pendant la lecture',
  'admin.analytics.playback.vitals.hint': 'Web Vitals de la page (LCP, CLS, INP) et longues images d’animation survenues pendant la séance, médiane (p50) et 95e centile (p95). Seul le web les mesure.',
  'admin.analytics.playback.vitals.column.day': 'Jour',
  'admin.analytics.playback.vitals.column.surface': 'Surface',
  'admin.analytics.playback.vitals.column.tier': 'Appareil',
  'admin.analytics.playback.vitals.column.lcp.p50': 'LCP p50',
  'admin.analytics.playback.vitals.column.lcp.p95': 'LCP p95',
  'admin.analytics.playback.vitals.column.cls.p50': 'CLS p50',
  'admin.analytics.playback.vitals.column.cls.p95': 'CLS p95',
  'admin.analytics.playback.vitals.column.inp.p50': 'INP p50',
  'admin.analytics.playback.vitals.column.inp.p95': 'INP p95',
  'admin.analytics.playback.vitals.column.longFrames.p95': 'Longues images p95',
  'admin.analytics.playback.vitals.column.longFramesBlocking.p95': 'Temps bloquant p95',
  'admin.analytics.playback.vitals.column.longFrameWorst.p95': 'Pire image p95',
} as const;

export type PlaybackTextKey = keyof typeof f;

export default f;
