/**
 * LA QUALITÉ D'UN APPEL (#8047) — tranche du catalogue, RÉPANDUE par
 * `catalog-de.ts` comme `catalog-de-call-screen.ts` : l'indicateur et le
 * détail de qualité, les pastilles de survie de la vidéo et les alertes d'un
 * pair (`call-quality-indicator.tsx`, `call-screen.tsx`).
 */
const deCallQuality = {
  'call.quality.indicator': 'Anrufqualität: {level}',
  'call.quality.level.excellent': 'ausgezeichnet',
  'call.quality.level.good': 'gut',
  'call.quality.level.fair': 'mittel',
  'call.quality.level.poor': 'schwach',
  'call.quality.detail': 'Anrufqualität',
  'call.quality.loss': 'Paketverlust',
  'call.quality.latency': 'Latenz',
  'call.quality.jitter': 'Jitter',
  'call.quality.audioRate': 'Audio-Bitrate',
  'call.quality.videoRate': 'Video-Bitrate',
  'call.quality.close': 'Details zur Anrufqualität schließen',
  'call.video.frozen': 'Schwaches Netz: Ihr Video ist verlangsamt',
  'call.video.suspended': 'Schwaches Netz: Ihr Video ist pausiert, der Ton läuft weiter',
  'call.alert.weakNetwork': 'Die Verbindung von {name} ist instabil',
  'call.alert.capturing': '{name} nimmt den Anrufbildschirm auf',
} as const;

export default deCallQuality;
