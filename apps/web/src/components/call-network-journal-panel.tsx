import type { ConnectionQualityLevel } from '@meeshy/shared/types/video-call';

import type { DataProfile } from '@/lib/calls/call-data-profile';
import { journalSummary, type JournalEvent } from '@/lib/calls/call-network-journal';
import { createCallJournalStore } from '@/lib/calls/call-network-journal-store';
import type { CallEndReason } from '@/lib/calls/call-store';
import { translate } from '@/lib/i18n-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';
import { safeLocalStorage, type SafeStorage } from '@/lib/storage';

/**
 * **« QUALITÉ ET RÉSEAU » DANS LA FICHE D'UN APPEL** (#8698) — ce que CE
 * téléphone a vu du réseau pendant l'appel, relu depuis le journal persisté de
 * son compte (`call-network-journal-store.ts`) : un résumé (la qualité la plus
 * basse, les pires perte et latence, les reconnexions, le passage par un
 * relais, le réseau, la fin et sa raison) puis la chronologie datée. Rien sur
 * ce téléphone, rien à montrer : la section se tait. Chunk à part
 * (`budgets.json` › `call_network_journal_panel`).
 */

const INK = 'var(--color-ios-ink)';
const INK_2 = 'var(--color-ios-ink-2)';
const CARD = { backgroundColor: 'var(--color-ios-card)' } as const;

const LEVEL = {
  excellent: 'call.quality.level.excellent',
  good: 'call.quality.level.good',
  fair: 'call.quality.level.fair',
  poor: 'call.quality.level.poor',
} as const satisfies Record<ConnectionQualityLevel, string>;

const PROFILE = {
  wifi: 'call.quality.profile.wifi',
  cellular: 'call.quality.profile.cellular',
  economy: 'call.quality.profile.economy',
} as const satisfies Record<DataProfile, string>;

const END = {
  local: 'callJournal.end.local',
  remote: 'callJournal.end.remote',
  rejected: 'callJournal.end.rejected',
  missed: 'callJournal.end.missed',
  connectionLost: 'callJournal.end.connectionLost',
  failed: 'callJournal.end.failed',
  busy: 'callJournal.end.busy',
  permission: 'callJournal.end.permission',
  removed: 'callJournal.end.removed',
} as const satisfies Record<CallEndReason, string>;

const LINK = {
  ringing: 'callJournal.link.connecting',
  waiting: 'callJournal.link.connecting',
  connecting: 'callJournal.link.connecting',
  connected: 'callJournal.link.connected',
  reconnecting: 'callJournal.link.reconnecting',
} as const;

const SURVIVAL = { sending: 'callJournal.event.resumed', frozen: 'callJournal.event.frozen', suspended: 'callJournal.event.suspended' } as const;

type Format = {
  readonly percent: (value: number) => string;
  readonly ms: (value: number) => string;
  readonly kbps: (value: number) => string;
  readonly clock: (at: number) => string;
};

function formats(language: InterfaceLanguage): Format {
  const unit = (unit: string, digits = 0) => new Intl.NumberFormat(language, { style: 'unit', unit, maximumFractionDigits: digits });
  const percent = new Intl.NumberFormat(language, { style: 'percent', maximumFractionDigits: 1 });
  const clock = new Intl.DateTimeFormat(language, { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  return {
    percent: (value) => percent.format(value / 100),
    ms: (value) => unit('millisecond').format(value),
    kbps: (value) => unit('kilobit-per-second').format(value),
    clock: (at) => clock.format(at),
  };
}

function eventText(event: JournalEvent, language: InterfaceLanguage, format: Format): string {
  switch (event.kind) {
    case 'phase':
      return event.phase === 'ended' ? translate(language, 'callJournal.event.ended', { reason: translate(language, END[event.reason]) }) : translate(language, `callJournal.event.${event.phase}`);
    case 'link':
      return translate(language, 'callJournal.event.link', { name: event.name, state: translate(language, LINK[event.state]) });
    case 'quality':
      return [translate(language, 'callJournal.event.quality', { level: translate(language, LEVEL[event.level]) }), format.percent(event.loss), format.ms(event.rtt), format.kbps(event.audioKbps + event.videoKbps)].join(' · ');
    case 'survival':
      return translate(language, SURVIVAL[event.stage]);
    case 'profile':
      return translate(language, 'callJournal.event.profile', { profile: translate(language, PROFILE[event.profile]), bitrate: format.kbps(event.audioBitrate / 1000) });
    case 'path':
      return translate(language, event.path === 'relay' ? 'callJournal.event.relay' : 'callJournal.event.direct');
  }
}

function summaryRows(events: readonly JournalEvent[], language: InterfaceLanguage, format: Format): ReadonlyArray<readonly [string, string, string]> {
  const summary = journalSummary(events);
  const paths = events.some((event) => event.kind === 'path');
  return [
    ...(summary.worstLevel === null
      ? []
      : ([
          ['worstLevel', translate(language, 'callJournal.summary.worstLevel'), translate(language, LEVEL[summary.worstLevel])],
          ['maxLoss', translate(language, 'callJournal.summary.maxLoss'), format.percent(summary.maxLoss)],
          ['maxRtt', translate(language, 'callJournal.summary.maxRtt'), format.ms(summary.maxRtt)],
        ] as const)),
    ['reconnections', translate(language, 'callJournal.summary.reconnections'), new Intl.NumberFormat(language).format(summary.reconnections)],
    ...(paths ? ([['path', translate(language, 'callJournal.summary.path'), translate(language, summary.relayed ? 'callJournal.path.relay' : 'callJournal.path.direct')]] as const) : []),
    ...(summary.profiles.length === 0 ? [] : ([['profile', translate(language, 'call.quality.profile'), summary.profiles.map((profile) => translate(language, PROFILE[profile])).join(' · ')]] as const)),
    ...(summary.endReason === null ? [] : ([['end', translate(language, 'callJournal.summary.end'), translate(language, END[summary.endReason])]] as const)),
  ];
}

export function CallNetworkJournal({ events, language, callId = '' }: { readonly events: readonly JournalEvent[]; readonly language: InterfaceLanguage; readonly callId?: string }) {
  if (events.length === 0) return null;
  const format = formats(language);
  const titleId = `network-${callId}`;
  return (
    <section aria-labelledby={titleId} className="grid gap-2" data-call-network-journal={callId}>
      <h3 id={titleId} className="px-1 text-caption font-semibold" style={{ color: INK_2 }}>
        {translate(language, 'callJournal.title')}
      </h3>
      <dl className="overflow-hidden rounded-card px-4 py-2" style={CARD}>
        {summaryRows(events, language, format).map(([field, label, value]) => (
          <div key={field} className="flex min-h-11 items-center justify-between gap-3 text-body" data-call-network-summary={field}>
            <dt style={{ color: INK_2 }}>{label}</dt>
            <dd className="text-end tabular-nums" style={{ color: INK }}>
              {value}
            </dd>
          </div>
        ))}
      </dl>
      <ol aria-label={translate(language, 'callJournal.chronology')} className="grid gap-1.5 rounded-card px-4 py-3" style={CARD}>
        {events.map((event, index) => (
          <li key={`${event.at}-${index}`} className="flex gap-3 text-caption" style={{ contentVisibility: 'auto', containIntrinsicSize: 'auto 20px' }} data-call-network-event={event.kind}>
            <time dateTime={new Date(event.at).toISOString()} className="shrink-0 tabular-nums" style={{ color: INK_2 }}>
              {format.clock(event.at)}
            </time>
            <span dir="auto" style={{ color: INK }}>
              {eventText(event, language, format)}
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}

export function CallNetworkJournalSection({ callId, viewerId, language, storage }: { readonly callId: string; readonly viewerId: string; readonly language: InterfaceLanguage; readonly storage?: SafeStorage }) {
  if (viewerId === '') return null;
  const events = createCallJournalStore({ storage: storage ?? safeLocalStorage(), now: Date.now }).read(viewerId, callId);
  return <CallNetworkJournal events={events} language={language} callId={callId} />;
}
