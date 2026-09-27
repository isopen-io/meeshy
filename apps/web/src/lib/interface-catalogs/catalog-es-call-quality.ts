/**
 * LA QUALITÉ D'UN APPEL (#8047) — tranche du catalogue, RÉPANDUE par
 * `catalog-es.ts` comme `catalog-es-call-screen.ts` : l'indicateur et le
 * détail de qualité, les pastilles de survie de la vidéo et les alertes d'un
 * pair (`call-quality-indicator.tsx`, `call-screen.tsx`).
 */
const esCallQuality = {
  'call.quality.indicator': 'Calidad de la llamada: {level}',
  'call.quality.level.excellent': 'excelente',
  'call.quality.level.good': 'buena',
  'call.quality.level.fair': 'regular',
  'call.quality.level.poor': 'baja',
  'call.quality.detail': 'Calidad de la llamada',
  'call.quality.loss': 'Pérdida de paquetes',
  'call.quality.latency': 'Latencia',
  'call.quality.jitter': 'Fluctuación',
  'call.quality.audioRate': 'Tasa de audio',
  'call.quality.videoRate': 'Tasa de vídeo',
  'call.quality.close': 'Cerrar el detalle de la calidad',
  'call.video.frozen': 'Red débil: tu vídeo va más lento',
  'call.video.suspended': 'Red débil: tu vídeo está en pausa, el audio continúa',
  'call.alert.weakNetwork': 'La conexión de {name} es inestable',
  'call.alert.capturing': '{name} está capturando la pantalla de la llamada',
} as const;

export default esCallQuality;
