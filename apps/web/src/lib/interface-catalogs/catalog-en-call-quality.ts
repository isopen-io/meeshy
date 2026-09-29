/**
 * LA QUALITÉ D'UN APPEL (#8047) — tranche du catalogue, RÉPANDUE par
 * `catalog-en.ts` comme `catalog-en-call-screen.ts` : l'indicateur et le
 * détail de qualité, les pastilles de survie de la vidéo et les alertes d'un
 * pair (`call-quality-indicator.tsx`, `call-screen.tsx`).
 */
const enCallQuality = {
  'call.quality.indicator': 'Call quality: {level}',
  'call.quality.level.excellent': 'excellent',
  'call.quality.level.good': 'good',
  'call.quality.level.fair': 'fair',
  'call.quality.level.poor': 'poor',
  'call.quality.detail': 'Call quality',
  'call.quality.loss': 'Packet loss',
  'call.quality.latency': 'Latency',
  'call.quality.jitter': 'Jitter',
  'call.quality.audioRate': 'Audio bitrate',
  'call.quality.videoRate': 'Video bitrate',
  'call.quality.close': 'Close call quality details',
  'call.quality.profile': 'Network',
  'call.quality.profile.wifi': 'Wi-Fi',
  'call.quality.profile.cellular': 'Mobile data',
  'call.quality.profile.economy': 'Data saver',
  'call.quality.audioCap': 'Audio cap',
  'call.quality.videoCap': 'Video cap',
  'call.video.frozen': 'Weak network: your video is slowed down',
  'call.video.suspended': 'Weak network: your video is paused, audio continues',
  'call.alert.weakNetwork': '{name}’s connection is unstable',
  'call.alert.capturing': '{name} is capturing the call screen',
} as const;

export default enCallQuality;
