import type { PlaybackTextKey } from './analytics-playback-fr';

const f = {
  'admin.analytics.playback.title': 'Calidad de reproducción',
  'admin.analytics.playback.hint': 'Tiempo hasta el primer fotograma y rebuffering, mediana (p50) y percentil 95 (p95), por día, superficie y gama de dispositivo.',
  'admin.analytics.playback.cells': 'Combinaciones mostradas',
  'admin.analytics.playback.suppressed': 'Combinaciones retenidas',
  'admin.analytics.playback.suppressed.caption': 'Por debajo de {count} cuentas distintas, una combinación nunca se muestra.',
  'admin.analytics.playback.sampled': 'Ventana limitada: los días más antiguos del periodo están incompletos.',
  'admin.analytics.playback.empty.title': 'Ninguna medición de reproducción en este periodo',
  'admin.analytics.playback.empty.hint': 'Una combinación solo aparece por encima del umbral de cuentas distintas.',
  'admin.analytics.playback.tier.low': 'Gama de entrada',
  'admin.analytics.playback.tier.mid': 'Gama media',
  'admin.analytics.playback.tier.high': 'Gama alta',
  'admin.analytics.playback.tier.unknown': 'No indicado',
  'admin.analytics.playback.column.day': 'Día',
  'admin.analytics.playback.column.surface': 'Superficie',
  'admin.analytics.playback.column.tier': 'Dispositivo',
  'admin.analytics.playback.column.sessions': 'Sesiones',
  'admin.analytics.playback.column.ttff.p50': 'Primer fotograma p50',
  'admin.analytics.playback.column.ttff.p95': 'Primer fotograma p95',
  'admin.analytics.playback.column.rebuffer.p50': 'Pausas de búfer p50',
  'admin.analytics.playback.column.rebuffer.p95': 'Pausas de búfer p95',
  'admin.analytics.playback.column.rebuffered': 'Sesiones interrumpidas',
} satisfies Readonly<Record<PlaybackTextKey, string>>;

export default f;
