/**
 * LA QUALITÉ D'UN APPEL (#8047) — tranche du catalogue, RÉPANDUE par
 * `catalog-fr.ts` comme `catalog-fr-call-screen.ts` : l'indicateur et le
 * détail de qualité, les pastilles de survie de la vidéo et les alertes d'un
 * pair (`call-quality-indicator.tsx`, `call-screen.tsx`).
 */
const frCallQuality = {
  'call.quality.indicator': 'Qualité de l’appel : {level}',
  'call.quality.level.excellent': 'excellente',
  'call.quality.level.good': 'bonne',
  'call.quality.level.fair': 'moyenne',
  'call.quality.level.poor': 'faible',
  'call.quality.detail': 'Qualité de l’appel',
  'call.quality.loss': 'Perte de paquets',
  'call.quality.latency': 'Latence',
  'call.quality.jitter': 'Gigue',
  'call.quality.audioRate': 'Débit audio',
  'call.quality.videoRate': 'Débit vidéo',
  'call.quality.close': 'Fermer le détail de la qualité',
  'call.video.frozen': 'Réseau faible : votre vidéo est ralentie',
  'call.video.suspended': 'Réseau faible : votre vidéo est en pause, l’audio continue',
  'call.alert.weakNetwork': 'La connexion de {name} est instable',
  'call.alert.capturing': '{name} capture l’écran de l’appel',
} as const;

export default frCallQuality;
