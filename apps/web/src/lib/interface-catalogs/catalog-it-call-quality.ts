/**
 * LA QUALITÉ D'UN APPEL (#8047) — tranche du catalogue, RÉPANDUE par
 * `catalog-it.ts` comme `catalog-it-call-screen.ts` : l'indicateur et le
 * détail de qualité, les pastilles de survie de la vidéo et les alertes d'un
 * pair (`call-quality-indicator.tsx`, `call-screen.tsx`).
 */
const itCallQuality = {
  'call.quality.indicator': 'Qualità della chiamata: {level}',
  'call.quality.level.excellent': 'eccellente',
  'call.quality.level.good': 'buona',
  'call.quality.level.fair': 'discreta',
  'call.quality.level.poor': 'scarsa',
  'call.quality.detail': 'Qualità della chiamata',
  'call.quality.loss': 'Perdita di pacchetti',
  'call.quality.latency': 'Latenza',
  'call.quality.jitter': 'Jitter',
  'call.quality.audioRate': 'Bitrate audio',
  'call.quality.videoRate': 'Bitrate video',
  'call.quality.close': 'Chiudi i dettagli della qualità',
  'call.video.frozen': 'Rete debole: il tuo video è rallentato',
  'call.video.suspended': 'Rete debole: il tuo video è in pausa, l’audio continua',
  'call.alert.weakNetwork': 'La connessione di {name} è instabile',
  'call.alert.capturing': '{name} sta catturando lo schermo della chiamata',
} as const;

export default itCallQuality;
