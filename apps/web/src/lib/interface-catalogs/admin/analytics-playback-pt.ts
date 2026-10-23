import type { PlaybackTextKey } from './analytics-playback-fr';

const f = {
  'admin.analytics.playback.title': 'Qualidade de reprodução',
  'admin.analytics.playback.hint': 'Tempo até o primeiro quadro e rebuffering, mediana (p50) e percentil 95 (p95), por dia, superfície e gama de aparelho.',
  'admin.analytics.playback.cells': 'Combinações exibidas',
  'admin.analytics.playback.suppressed': 'Combinações retidas',
  'admin.analytics.playback.suppressed.caption': 'Abaixo de {count} contas distintas, uma combinação nunca é exibida.',
  'admin.analytics.playback.sampled': 'Janela limitada: os dias mais antigos do período estão incompletos.',
  'admin.analytics.playback.empty.title': 'Nenhuma medição de reprodução neste período',
  'admin.analytics.playback.empty.hint': 'Uma combinação só aparece acima do limite de contas distintas.',
  'admin.analytics.playback.tier.low': 'Entrada',
  'admin.analytics.playback.tier.mid': 'Intermediário',
  'admin.analytics.playback.tier.high': 'Topo de linha',
  'admin.analytics.playback.tier.unknown': 'Não informado',
  'admin.analytics.playback.column.day': 'Dia',
  'admin.analytics.playback.column.surface': 'Superfície',
  'admin.analytics.playback.column.tier': 'Aparelho',
  'admin.analytics.playback.column.sessions': 'Sessões',
  'admin.analytics.playback.column.ttff.p50': 'Primeiro quadro p50',
  'admin.analytics.playback.column.ttff.p95': 'Primeiro quadro p95',
  'admin.analytics.playback.column.rebuffer.p50': 'Pausas de buffer p50',
  'admin.analytics.playback.column.rebuffer.p95': 'Pausas de buffer p95',
  'admin.analytics.playback.column.rebuffered': 'Sessões interrompidas',
} satisfies Readonly<Record<PlaybackTextKey, string>>;

export default f;
