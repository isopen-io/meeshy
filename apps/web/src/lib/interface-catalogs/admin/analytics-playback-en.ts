import type { PlaybackTextKey } from './analytics-playback-fr';

const f = {
  'admin.analytics.playback.title': 'Playback quality',
  'admin.analytics.playback.hint': 'Time to first frame and rebuffering, median (p50) and 95th percentile (p95), by day, surface and device range.',
  'admin.analytics.playback.cells': 'Combinations served',
  'admin.analytics.playback.suppressed': 'Combinations withheld',
  'admin.analytics.playback.suppressed.caption': 'Below {count} distinct accounts, a combination is never shown.',
  'admin.analytics.playback.sampled': 'Capped window: the oldest days of the period are incomplete.',
  'admin.analytics.playback.empty.title': 'No playback measurement served for this period',
  'admin.analytics.playback.empty.hint': 'A combination only appears above the distinct-account threshold.',
  'admin.analytics.playback.tier.low': 'Entry-level',
  'admin.analytics.playback.tier.mid': 'Mid-range',
  'admin.analytics.playback.tier.high': 'High-end',
  'admin.analytics.playback.tier.unknown': 'Not reported',
  'admin.analytics.playback.column.day': 'Day',
  'admin.analytics.playback.column.surface': 'Surface',
  'admin.analytics.playback.column.tier': 'Device',
  'admin.analytics.playback.column.sessions': 'Sessions',
  'admin.analytics.playback.column.ttff.p50': 'First frame p50',
  'admin.analytics.playback.column.ttff.p95': 'First frame p95',
  'admin.analytics.playback.column.rebuffer.p50': 'Rebuffer p50',
  'admin.analytics.playback.column.rebuffer.p95': 'Rebuffer p95',
  'admin.analytics.playback.column.rebuffered': 'Interrupted sessions',
} satisfies Readonly<Record<PlaybackTextKey, string>>;

export default f;
