import { colorForName } from '@meeshy/shared/utils/conversation-colors';
import type { ReactNode } from 'react';

import { Avatar } from '@/components/avatar';
import { CHROME_ACTION_HIT_CLASS, ChromeActionDisc } from '@/components/chrome-action';
import { Glyph, GlyphSvg } from '@/components/glyph';
import { CALLS_GLYPHS, type CallsGlyphName } from '@/components/glyphs-calls';
import { callAbsoluteDate, callDataLabel, type CallDetail } from '@/lib/calls/call-detail';
import type { CallMedia } from '@/lib/calls/call-store';
import { callDurationLabel } from '@/lib/calls/view';
import { translate } from '@/lib/i18n-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';
import { shortRelativeTime } from '@/lib/relative-time';
import { initialsOf } from '@/lib/view/conversation';
import { Link } from '@/routes/route-table';

/**
 * **LES PIÈCES DE LA FICHE D'UN APPEL** (#6383) — miroir de `CallDetailSheet.swift` :
 * l'avatar et le nom, la ligne d'état (direction · heure relative), deux
 * boutons de rappel (vocal, vidéo), puis Type, Date, Durée et Données. Le
 * numéro du pair n'y est pas (D-127). Chaque pièce est PURE : `routes/
 * call-detail.test.tsx` les rend sans DOM ni TanStack Query.
 *
 * iOS présente une FEUILLE au-dessus du journal ; le web sert une ADRESSE
 * (`/call/:callId`), parce que le lien profond du legacy y mène déjà et qu'une
 * feuille n'a pas d'adresse à partager. Même contenu, même ordre, même geste
 * principal (le rappel) ; « Ouvrir la conversation » remplace le tap de la
 * ligne, qui ouvrait le fil avant cette fiche.
 */

const INK = 'var(--color-ios-ink)';
const INK_2 = 'var(--color-ios-ink-2)';
const BRAND = 'var(--color-ios-brand)';
const MISSED_INK = 'var(--color-error)';
const CARD = { backgroundColor: 'var(--color-ios-card)' } as const;
const EDGE = '1px solid color-mix(in srgb, var(--color-ios-ink-3) 18%, transparent)';

const DIRECTION_LABEL = {
  incoming: 'calls.direction.incoming',
  outgoing: 'calls.direction.outgoing',
  missed: 'calls.direction.missed',
} as const;

export function CallDetailHeader({ language }: { readonly language: InterfaceLanguage }) {
  return (
    <header className="flex shrink-0 items-center gap-1 px-2" style={{ height: 64 }}>
      <Link
        to="calls"
        aria-label={translate(language, 'pending.back')}
        data-call-detail-back
        className={`${CHROME_ACTION_HIT_CLASS} focus-visible:outline-2 focus-visible:outline-offset-2`}
        style={{ color: BRAND, outlineColor: BRAND }}
      >
        <ChromeActionDisc>
          <Glyph name="caretLeft" size={16} />
        </ChromeActionDisc>
      </Link>
      <h1 className="min-w-0 flex-1 truncate text-body font-semibold" style={{ color: INK }}>
        {translate(language, 'callJoin.detail.title')}
      </h1>
    </header>
  );
}

function RedialButton({
  language,
  media,
  name,
  onCall,
}: {
  readonly language: InterfaceLanguage;
  readonly media: CallMedia;
  readonly name: string;
  readonly onCall: (media: CallMedia) => void;
}) {
  const label = translate(language, media === 'video' ? 'call.action.video' : 'call.action.audio');
  return (
    <button
      type="button"
      data-call-detail-redial={media}
      aria-label={translate(language, media === 'video' ? 'keypad.call.video.named' : 'keypad.call.audio.named', { name })}
      onClick={() => onCall(media)}
      className="flex min-h-12 flex-1 items-center justify-center gap-2 rounded-card px-3 text-body font-semibold text-white focus-visible:outline-2 focus-visible:outline-offset-2"
      style={{ backgroundColor: 'var(--ios-indigo-600)', outlineColor: BRAND }}
    >
      {media === 'video' ? <GlyphSvg glyph={CALLS_GLYPHS.videoCamera} size={18} /> : <Glyph name="phone" size={18} />}
      <span aria-hidden="true">{label}</span>
    </button>
  );
}

function DetailRow({ glyph, label, value, field }: { readonly glyph: ReactNode; readonly label: string; readonly value: string; readonly field: string }) {
  return (
    <div data-call-detail-row={field} className="flex min-h-12 items-center gap-3 px-4 py-2.5" style={{ borderBottom: EDGE }}>
      <span aria-hidden="true" className="grid w-6 shrink-0 place-items-center" style={{ color: BRAND }}>
        {glyph}
      </span>
      <dt className="text-body" style={{ color: INK_2 }}>
        {label}
      </dt>
      <dd className="ml-auto min-w-0 truncate text-right text-body font-medium tabular-nums" style={{ color: INK }}>
        {value}
      </dd>
    </div>
  );
}

const glyphOf = (name: CallsGlyphName) => <GlyphSvg glyph={CALLS_GLYPHS[name]} size={16} />;

export function CallDetailCard({
  language,
  detail,
  now,
  onCall,
}: {
  readonly language: InterfaceLanguage;
  readonly detail: CallDetail;
  readonly now: Date;
  readonly onCall: (media: CallMedia) => void;
}) {
  const missed = detail.direction === 'missed';
  const status = [translate(language, DIRECTION_LABEL[detail.direction]), detail.startedAt === null ? '' : shortRelativeTime(new Date(detail.startedAt), now, language)]
    .filter((part) => part !== '')
    .join(' · ');
  const duration = callDurationLabel(detail.durationSec);
  const data = callDataLabel(detail.bytes, language);
  const date = callAbsoluteDate(detail.startedAt, language);

  return (
    <div data-call-detail={detail.callId} className="mx-auto grid w-full max-w-xl gap-6 px-4 pb-12 pt-2">
      <div className="grid justify-items-center gap-2 text-center">
        <Avatar initials={initialsOf(detail.name)} color={colorForName(detail.name)} size={72} {...(detail.avatar === null ? {} : { src: detail.avatar })} />
        <h2 data-call-detail-name className="max-w-full break-words text-screen font-bold" style={{ color: INK }}>
          {detail.name}
        </h2>
        <p data-call-detail-status={detail.direction} className="text-caption font-medium" style={{ color: missed ? MISSED_INK : INK_2 }}>
          {status}
        </p>
      </div>
      <div className="flex gap-3">
        <RedialButton language={language} media="audio" name={detail.name} onCall={onCall} />
        <RedialButton language={language} media="video" name={detail.name} onCall={onCall} />
      </div>
      <dl className="overflow-hidden rounded-card" style={CARD}>
        <DetailRow
          field="type"
          glyph={detail.media === 'video' ? glyphOf('videoCamera') : <Glyph name="phone" size={16} />}
          label={translate(language, 'callJoin.detail.type')}
          value={translate(language, detail.media === 'video' ? 'calls.type.video' : 'calls.type.audio')}
        />
        {date === '' ? null : <DetailRow field="date" glyph={glyphOf('calendarBlank')} label={translate(language, 'callJoin.detail.date')} value={date} />}
        {duration === '' ? null : <DetailRow field="duration" glyph={<Glyph name="timer" size={16} />} label={translate(language, 'callJoin.detail.duration')} value={duration} />}
        {data === null ? null : <DetailRow field="data" glyph={glyphOf('arrowsDownUp')} label={translate(language, 'callJoin.detail.data')} value={data} />}
      </dl>
      <Link
        to="thread"
        params={{ conversation: detail.conversationId }}
        data-call-detail-open
        className="grid min-h-12 place-items-center rounded-card px-4 text-body font-semibold focus-visible:outline-2 focus-visible:outline-offset-2"
        style={{ ...CARD, color: BRAND, outlineColor: BRAND }}
      >
        {translate(language, 'callJoin.detail.openConversation')}
      </Link>
    </div>
  );
}

export function CallDetailState({
  language,
  kind,
  onRetry,
}: {
  readonly language: InterfaceLanguage;
  readonly kind: 'not-found' | 'error' | 'offline' | 'joining';
  readonly onRetry?: () => void;
}) {
  const [title, body] =
    kind === 'not-found'
      ? (['callJoin.detail.notFound.title', 'callJoin.detail.notFound.body'] as const)
      : kind === 'offline'
        ? (['calls.offline.title', 'calls.offline.cold.body'] as const)
        : kind === 'joining'
          ? (['callJoin.detail.joining', null] as const)
          : (['calls.error.title', 'calls.error.body'] as const);
  return (
    <div
      role={kind === 'joining' ? 'status' : 'alert'}
      data-call-detail-state={kind}
      className="grid flex-1 content-center justify-items-center gap-3 px-6 py-10 text-center"
    >
      <span aria-hidden="true" style={{ color: kind === 'joining' ? 'var(--color-success)' : kind === 'not-found' ? INK_2 : MISSED_INK }}>
        {kind === 'joining' ? <Glyph name="phone" size={28} /> : <Glyph name="warningCircle" size={28} />}
      </span>
      <p className="text-body font-semibold" style={{ color: INK }}>
        {translate(language, title)}
      </p>
      {body === null ? null : (
        <p className="text-caption" style={{ color: INK_2 }}>
          {translate(language, body)}
        </p>
      )}
      {kind === 'error' && onRetry !== undefined ? (
        <button
          type="button"
          data-call-detail-retry
          onClick={onRetry}
          className="grid place-items-center rounded-chip px-5 text-body font-semibold text-white focus-visible:outline-2 focus-visible:outline-offset-2"
          style={{ backgroundColor: 'var(--ios-indigo-600)', minHeight: 44, outlineColor: BRAND }}
        >
          {translate(language, 'calls.retry')}
        </button>
      ) : null}
    </div>
  );
}

export function CallDetailSkeleton({ language }: { readonly language: InterfaceLanguage }) {
  return (
    <div aria-busy="true" aria-label={translate(language, 'callJoin.detail.loading')} data-call-detail-skeleton className="mx-auto grid w-full max-w-xl gap-6 px-4 pt-2">
      <div className="grid justify-items-center gap-2">
        <div className="rounded-full" style={{ width: 72, height: 72, backgroundColor: 'var(--color-edge)' }} />
        <div className="rounded-chip" style={{ width: '45%', height: 16, backgroundColor: 'var(--color-edge)' }} />
      </div>
      <div className="rounded-card" style={{ height: 48, backgroundColor: 'var(--color-edge)' }} />
      <div className="rounded-card" style={{ height: 144, backgroundColor: 'var(--color-edge)' }} />
    </div>
  );
}
