/**
 * LA QUALITÉ D'UN APPEL (#8047) — tranche du catalogue, RÉPANDUE par
 * `catalog-pt.ts` comme `catalog-pt-call-screen.ts` : l'indicateur et le
 * détail de qualité, les pastilles de survie de la vidéo et les alertes d'un
 * pair (`call-quality-indicator.tsx`, `call-screen.tsx`).
 */
const ptCallQuality = {
  'call.quality.indicator': 'Qualidade da chamada: {level}',
  'call.quality.level.excellent': 'excelente',
  'call.quality.level.good': 'boa',
  'call.quality.level.fair': 'razoável',
  'call.quality.level.poor': 'fraca',
  'call.quality.detail': 'Qualidade da chamada',
  'call.quality.loss': 'Perda de pacotes',
  'call.quality.latency': 'Latência',
  'call.quality.jitter': 'Jitter',
  'call.quality.audioRate': 'Débito de áudio',
  'call.quality.videoRate': 'Débito de vídeo',
  'call.quality.close': 'Fechar o detalhe da qualidade',
  'call.video.frozen': 'Rede fraca: o seu vídeo está mais lento',
  'call.video.suspended': 'Rede fraca: o seu vídeo está em pausa, o áudio continua',
  'call.alert.weakNetwork': 'A ligação de {name} está instável',
  'call.alert.capturing': '{name} está a capturar o ecrã da chamada',
} as const;

export default ptCallQuality;
