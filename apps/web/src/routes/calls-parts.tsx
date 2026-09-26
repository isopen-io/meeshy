import { colorForName } from '@meeshy/shared/utils/conversation-colors';
import { memo } from 'react';

import { Avatar } from '@/components/avatar';
import { CHROME_ACTION_HIT_CLASS, ChromeActionDisc } from '@/components/chrome-action';
import { Glyph, GlyphSvg } from '@/components/glyph';
import { CALLS_GLYPHS, type CallsGlyphName } from '@/components/glyphs-calls';
import { CALL_HISTORY_FILTERS, type CallDirection, type CallHistoryFilter, type CallRecord } from '@/lib/api/calls';
import { callActions } from '@/lib/calls/call-actions';
import { callAvatarOf, callDisplayNameOf, callDurationLabel } from '@/lib/calls/view';
import { translate } from '@/lib/i18n-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';
import { shortRelativeTime } from '@/lib/relative-time';
import { initialsOf } from '@/lib/view/conversation';
import { FLOATING_CORRIDOR_BOTTOM } from '@/lib/view/floating-corridor';
import { Link } from '@/routes/route-table';

/**
 * **LES PIÈCES DU JOURNAL D'APPELS** (#6362) — miroir de `CallsTab.swift`
 * (filtre, liste, état vide) et de `CallJournalRow` (avatar, nom rouge d'un
 * manqué, glyphe de direction, vidéo, heure relative, durée).
 *
 * Chaque pièce est PURE (primitives en props, aucun magasin global) :
 * `routes/calls.test.tsx` les rend sans DOM ni TanStack Query, et l'écran ne
 * fait que les composer.
 *
 * **Divergence assumée : la direction se LIT, elle ne se devine pas à la
 * couleur.** iOS rend reçu et manqué avec le même glyphe (`arrow.down.left`),
 * le manqué seulement en rouge, et ne nomme la direction qu'au lecteur d'écran.
 * Ici chaque ligne porte un glyphe PROPRE à sa direction (le manqué a le sien,
 * `phone-x`) ET son libellé visible (« Manqué », « Reçu », « Émis ») — WCAG
 * 1.4.1 : une information ne passe jamais par la couleur seule.
 */

export const CALLS_HEADER_HEIGHT = 64;
export const CALLS_RAIL_HEIGHT = 52;
/** Au repos, la première ligne commence sous les disques flottants (`floating-corridor.ts`). */
export const CALLS_TOP_RESERVE = FLOATING_CORRIDOR_BOTTOM - CALLS_HEADER_HEIGHT - CALLS_RAIL_HEIGHT;
/** Une ligne à deux lignes de texte et avatar de 44 — l'échelle de la marge du défilement infini. */
export const CALL_ROW_HEIGHT = 68;

const INK = 'var(--color-ios-ink)';
const INK_2 = 'var(--color-ios-ink-2)';
const MISSED_INK = 'var(--color-error)';
const BRAND = 'var(--color-ios-brand)';
/** L'encre indigo lisible dans les deux schémas — celle de la cloche (`notifications.tsx`). */
const BRAND_INK = 'text-[color:var(--ios-indigo-400)] light:text-[color:var(--ios-indigo-600)]';
const EDGE = '1px solid color-mix(in srgb, var(--color-ios-ink-3) 18%, transparent)';

export const DIRECTION_GLYPHS: Readonly<Record<CallDirection, CallsGlyphName>> = {
  incoming: 'arrowDownLeft',
  outgoing: 'arrowUpRight',
  missed: 'phoneX',
};

export function CallGlyph({ name, size }: { readonly name: CallsGlyphName; readonly size: number }) {
  return <GlyphSvg glyph={CALLS_GLYPHS[name]} size={size} />;
}

export function CallsHeader({ language }: { readonly language: InterfaceLanguage }) {
  return (
    <header className="flex shrink-0 items-center gap-1 px-2" style={{ height: CALLS_HEADER_HEIGHT }}>
      <Link
        to="list"
        aria-label={translate(language, 'pending.back')}
        data-calls-back
        className={`${CHROME_ACTION_HIT_CLASS} focus-visible:outline-2 focus-visible:outline-offset-2`}
        style={{ color: BRAND, outlineColor: BRAND }}
      >
        <ChromeActionDisc>
          <Glyph name="caretLeft" size={16} />
        </ChromeActionDisc>
      </Link>
      <h1 className="min-w-0 flex-1 truncate text-body font-semibold" style={{ color: INK }}>
        {translate(language, 'root.menu.calls')}
      </h1>
    </header>
  );
}

/**
 * Les deux capsules de `CallsTab.filterChips` : pleine quand choisie, cerclée
 * sinon. La capsule pleine est l'indigo 600 et non le 500 d'iOS : un texte blanc
 * sur l'indigo 500 descend à 4,47:1, sous AA.
 */
export function CallFilterRail({
  language,
  selected,
  onSelect,
}: {
  readonly language: InterfaceLanguage;
  readonly selected: CallHistoryFilter;
  readonly onSelect: (filter: CallHistoryFilter) => void;
}) {
  return (
    <div
      role="group"
      aria-label={translate(language, 'calls.filters')}
      className="flex shrink-0 items-center gap-2 px-4"
      style={{ height: CALLS_RAIL_HEIGHT }}
    >
      {CALL_HISTORY_FILTERS.map((filter) => {
        const pressed = filter === selected;
        return (
          <button
            key={filter}
            type="button"
            data-call-filter={filter}
            aria-pressed={pressed}
            onClick={() => onSelect(filter)}
            className="grid shrink-0 place-items-center rounded-chip focus-visible:outline-2"
            style={{ minHeight: 44, outlineColor: BRAND }}
          >
            <span
              className={`grid place-items-center rounded-chip px-3.5 text-caption font-semibold ${pressed ? '' : BRAND_INK}`}
              style={
                pressed
                  ? { height: 30, color: 'white', backgroundColor: 'var(--ios-indigo-600)' }
                  : { height: 30, boxShadow: 'inset 0 0 0 1px color-mix(in srgb, var(--ios-indigo-600) 35%, transparent)' }
              }
            >
              {translate(language, filter === 'all' ? 'calls.filter.all' : 'calls.filter.missed')}
            </span>
          </button>
        );
      })}
    </div>
  );
}

export const DIRECTION_LABEL = {
  incoming: 'calls.direction.incoming',
  outgoing: 'calls.direction.outgoing',
  missed: 'calls.direction.missed',
} as const;

const DIRECTION_A11Y = {
  incoming: 'calls.a11y.incoming',
  outgoing: 'calls.a11y.outgoing',
  missed: 'calls.a11y.missed',
} as const;

/**
 * UNE LIGNE — `CallJournalRow`. La toucher ouvre la FICHE de l'appel
 * (`CallDetailSheet`, #6383), comme iOS ; le fil de la conversation s'ouvre
 * depuis la fiche. Le RAPPEL direct est le bouton à sa droite, du même type
 * que l'appel d'origine (#6382). Son `aria-label` recompose TOUT ce que la ligne montre, comme
 * `rowAccessibilityLabel` d'iOS : nom, direction, type, heure, durée.
 */
export const CallRow = memo(function CallRow({
  language,
  record,
  now,
  onOpen,
}: {
  readonly language: InterfaceLanguage;
  readonly record: CallRecord;
  readonly now: Date;
  readonly onOpen: (record: CallRecord) => void;
}) {
  const name = callDisplayNameOf(record, translate(language, 'calls.unknown'));
  const avatar = callAvatarOf(record);
  const missed = record.direction === 'missed';
  const time = shortRelativeTime(new Date(record.startedAt), now, language);
  const duration = callDurationLabel(record.durationSec);
  const label = [
    name,
    translate(language, DIRECTION_A11Y[record.direction]),
    translate(language, record.isVideo ? 'calls.type.video' : 'calls.type.audio'),
    time,
    ...(duration === '' ? [] : [translate(language, 'calls.duration', { duration })]),
  ].join(', ');

  return (
    <li data-call={record.callId} className="flex items-center" style={{ borderBottom: EDGE }}>
      <button
        type="button"
        onClick={() => onOpen(record)}
        aria-label={label}
        aria-haspopup="dialog"
        data-call-row
        className="flex min-w-0 flex-1 items-center gap-3.5 py-3 pl-5 pr-2 text-start focus-visible:outline-2 focus-visible:-outline-offset-2"
        style={{ minHeight: CALL_ROW_HEIGHT, outlineColor: BRAND }}
      >
        <Avatar initials={initialsOf(name)} color={colorForName(name)} size={44} {...(avatar === null ? {} : { src: avatar })} />
        <span className="grid min-w-0 flex-1 gap-0.5">
          <span data-call-name className="truncate text-body font-semibold" style={{ color: missed ? MISSED_INK : INK }}>
            {name}
          </span>
          <span data-call-meta className="flex min-w-0 items-center gap-1.5 text-caption font-medium" style={{ color: INK_2 }}>
            <span className="flex shrink-0 items-center gap-1" style={{ color: missed ? MISSED_INK : INK_2 }}>
              <CallGlyph name={DIRECTION_GLYPHS[record.direction]} size={12} />
              <span data-call-direction={record.direction}>{translate(language, DIRECTION_LABEL[record.direction])}</span>
            </span>
            {record.isVideo ? (
              <span data-call-video className="grid shrink-0 place-items-center">
                <CallGlyph name="videoCamera" size={13} />
              </span>
            ) : null}
            <span aria-hidden="true">·</span>
            <time dateTime={record.startedAt} className="truncate">
              {time}
            </time>
            {duration === '' ? null : (
              <>
                <span aria-hidden="true">·</span>
                <span data-call-duration className="shrink-0 tabular-nums">
                  {duration}
                </span>
              </>
            )}
          </span>
        </span>
      </button>
      <button
        type="button"
        data-call-back={record.isVideo ? 'video' : 'audio'}
        aria-label={translate(language, 'call.callBack.named', { name })}
        onClick={() =>
          callActions.start({
            conversationId: record.conversationId,
            media: record.isVideo ? 'video' : 'audio',
            title: name,
            avatar,
            isGroup: record.conversationType !== 'direct',
          })
        }
        className="mr-3 grid size-11 shrink-0 place-items-center rounded-full focus-visible:outline-2 focus-visible:outline-offset-2"
        style={{ color: BRAND, outlineColor: BRAND }}
      >
        {record.isVideo ? <CallGlyph name="videoCamera" size={20} /> : <Glyph name="phone" size={20} />}
      </button>
    </li>
  );
});

export function CallsEmpty({ language, filter }: { readonly language: InterfaceLanguage; readonly filter: CallHistoryFilter }) {
  const missed = filter === 'missed';
  return (
    <li data-calls-empty={filter} className="grid flex-1 content-center justify-items-center gap-3 px-6 py-10 text-center">
      <span aria-hidden="true" style={{ color: BRAND }}>
        <CallGlyph name={missed ? 'phoneX' : 'phoneOutgoing'} size={44} />
      </span>
      <p className="text-body font-semibold" style={{ color: INK }}>
        {translate(language, missed ? 'calls.empty.missed.title' : 'calls.empty.title')}
      </p>
      <p className="text-caption" style={{ color: INK_2 }}>
        {translate(language, missed ? 'calls.empty.missed.subtitle' : 'calls.empty.subtitle')}
      </p>
    </li>
  );
}

/** Erreur À CACHE VIDE — sur un cache non vide, le journal reste. */
export function CallsError({
  language,
  online,
  onRetry,
}: {
  readonly language: InterfaceLanguage;
  readonly online: boolean;
  readonly onRetry: () => void;
}) {
  return (
    <li role="alert" data-calls-error className="grid flex-1 content-center justify-items-center gap-3 px-6 py-10 text-center">
      <span style={{ color: MISSED_INK }}>
        <Glyph name="warningCircle" size={28} />
      </span>
      <p className="text-body font-semibold" style={{ color: INK }}>
        {translate(language, online ? 'calls.error.title' : 'calls.offline.title')}
      </p>
      <p className="text-caption" style={{ color: INK_2 }}>
        {translate(language, online ? 'calls.error.body' : 'calls.offline.body')}
      </p>
      <button
        type="button"
        data-calls-retry
        onClick={onRetry}
        className="grid place-items-center rounded-chip px-5 text-body font-semibold text-white focus-visible:outline-2 focus-visible:outline-offset-2"
        style={{ backgroundColor: 'var(--ios-indigo-600)', minHeight: 44, outlineColor: BRAND }}
      >
        {translate(language, 'calls.retry')}
      </button>
    </li>
  );
}

/**
 * Hors ligne. Sur un cache non vide, le journal reste et l'annonce le dit ; à
 * cache FROID (#6419), rien n'a jamais été chargé : l'annonce dit ce qui se
 * passera au retour du réseau, jamais « le journal du dernier chargement ».
 */
export function CallsOfflineNotice({ language, cold }: { readonly language: InterfaceLanguage; readonly cold: boolean }) {
  return (
    <li role="status" data-calls-offline={cold ? 'cold' : 'cached'} className="flex items-start gap-3 px-5 py-3" style={{ borderBottom: EDGE }}>
      <span aria-hidden="true" className="pt-0.5" style={{ color: 'var(--color-warning)' }}>
        <Glyph name="warningCircle" size={18} />
      </span>
      <span className="grid gap-0.5">
        <span className="text-body font-semibold" style={{ color: INK }}>
          {translate(language, 'calls.offline.title')}
        </span>
        <span className="text-caption" style={{ color: INK_2 }}>
          {translate(language, cold ? 'calls.offline.cold.body' : 'calls.offline.body')}
        </span>
      </span>
    </li>
  );
}

const SKELETON_ROWS = [0, 1, 2, 3, 4] as const;

/** Le démarrage à froid SEUL — l'annonce « Chargement » vit sur le scrollport. */
export function CallsSkeleton() {
  return (
    <div aria-hidden="true" data-calls-skeleton className="flex flex-col">
      {SKELETON_ROWS.map((i) => (
        <div key={i} className="flex items-center gap-3.5 px-5 py-3" style={{ borderBottom: EDGE, minHeight: CALL_ROW_HEIGHT }}>
          <div className="shrink-0 rounded-full" style={{ width: 44, height: 44, backgroundColor: 'var(--color-edge)' }} />
          <div className="flex flex-1 flex-col gap-2">
            <div className="rounded-chip" style={{ width: '55%', height: 12, backgroundColor: 'var(--color-edge)' }} />
            <div className="rounded-chip" style={{ width: '35%', height: 10, backgroundColor: 'var(--color-edge)' }} />
          </div>
        </div>
      ))}
    </div>
  );
}
