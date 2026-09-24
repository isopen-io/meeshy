import { colorForName } from '@meeshy/shared/utils/conversation-colors';
import { memo, useId, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from 'react';

import { Avatar } from '@/components/avatar';
import { CHROME_ACTION_HIT_CLASS, ChromeActionDisc } from '@/components/chrome-action';
import { Field } from '@/components/field';
import { Glyph, GlyphSvg } from '@/components/glyph';
import { DISCOVER_GLYPHS, type DiscoverGlyphName } from '@/components/glyphs-discover';
import { unreadBadgeText } from '@/components/unread-badge';
import type { FriendRequestRecord, PersonSummary } from '@/lib/api/friend-requests';
import { DISCOVER_TABS, REQUEST_FILTERS, personNameOf, type DiscoverTab, type Relationship, type RequestFilter } from '@/lib/discover/view';
import { translate } from '@/lib/i18n-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';
import { shortRelativeTime } from '@/lib/relative-time';
import { initialsOf } from '@/lib/view/conversation';
import { FLOATING_CORRIDOR_BOTTOM } from '@/lib/view/floating-corridor';
import { findFocusableIndex } from '@/lib/view/roving-menu';
import { Link } from '@/routes/route-table';

/**
 * **LES PIÈCES DE LA DÉCOUVERTE** (#6363) — miroir de `PeopleDiscoveryView`
 * (en-tête, barre d'onglets soulignés), `DiscoverTab` (invitation, recherche,
 * `ConnectionActionView`), `RequestsTab` (filtre Reçues / Envoyées, lignes) et
 * `BlockedTab` (lignes, confirmation).
 *
 * Chaque pièce est PURE (primitives en props, aucun magasin global) :
 * `routes/discover.test.tsx` les rend sans DOM ni TanStack Query.
 *
 * **Aucune pastille de présence.** Aucune pièce ne passe `presence` à l'avatar :
 * les personnes de ces listes sont, pour la plupart, des inconnus dont la
 * présence n'est jamais servie (loi `resolvePresenceVisibility`), et le port
 * la retire même d'un ami (D-62).
 *
 * **Divergences d'encre assumées** (AA) : les capsules et le badge d'onglet
 * sont à l'indigo 600, pas au 500 d'iOS (texte blanc à 4,47:1) ; le disque
 * « Accepter » est le vert ASSOMBRI (coche blanche sur le vert d'iOS à 2,5:1
 * en sombre).
 */

export const DISCOVER_HEADER_HEIGHT = 64;
export const DISCOVER_TABS_HEIGHT = 52;
/** Au repos, le contenu commence sous les disques flottants (`floating-corridor.ts`). */
export const DISCOVER_TOP_RESERVE = FLOATING_CORRIDOR_BOTTOM - DISCOVER_HEADER_HEIGHT - DISCOVER_TABS_HEIGHT;
export const PERSON_ROW_HEIGHT = 72;

const INK = 'var(--color-ios-ink)';
const INK_2 = 'var(--color-ios-ink-2)';
const BRAND = 'var(--color-ios-brand)';
const BRAND_FILL = 'var(--ios-indigo-600)';
const BRAND_INK = 'text-[color:var(--ios-indigo-400)] light:text-[color:var(--ios-indigo-600)]';
const EDGE = '1px solid color-mix(in srgb, var(--color-ios-ink-3) 18%, transparent)';
const FIELD_FILL = 'color-mix(in srgb, var(--color-ios-ink-3) 14%, transparent)';
const FOCUS = 'focus-visible:outline-2 focus-visible:outline-offset-2';

type Tone = 'success' | 'warning' | 'error';
const TONE_INK: Readonly<Record<Tone, string>> = {
  success: 'var(--color-success)',
  warning: 'var(--color-warning)',
  error: 'var(--color-error)',
};
/** 9 % et pas les 15 % d'iOS : au-delà, le vert « Contact » descend sous AA en clair sur son propre voile (mesuré 4,49:1 à 14 %). */
const toneFill = (tone: Tone): string => `color-mix(in srgb, ${TONE_INK[tone]} 9%, transparent)`;

export function DiscoverGlyph({ name, size }: { readonly name: DiscoverGlyphName; readonly size: number }) {
  return <GlyphSvg glyph={DISCOVER_GLYPHS[name]} size={size} />;
}

export function DiscoverHeader({ language }: { readonly language: InterfaceLanguage }) {
  return (
    <header className="flex shrink-0 items-center gap-1 px-2" style={{ height: DISCOVER_HEADER_HEIGHT }}>
      <Link
        to="list"
        aria-label={translate(language, 'pending.back')}
        data-discover-back
        className={`${CHROME_ACTION_HIT_CLASS} ${FOCUS}`}
        style={{ color: BRAND, outlineColor: BRAND }}
      >
        <ChromeActionDisc>
          <Glyph name="caretLeft" size={16} />
        </ChromeActionDisc>
      </Link>
      <h1 className="min-w-0 flex-1 truncate text-body font-semibold" style={{ color: INK }}>
        {translate(language, 'root.menu.discover')}
      </h1>
    </header>
  );
}

const TAB_LABEL = { discover: 'discover.tab.discover', requests: 'discover.tab.requests', blocked: 'discover.tab.blocked' } as const;

function TabGlyph({ tab }: { readonly tab: DiscoverTab }) {
  if (tab === 'discover') return <Glyph name="magnifyingGlass" size={14} />;
  return <DiscoverGlyph name={tab === 'requests' ? 'userPlus' : 'handPalm'} size={14} />;
}

/** Le nom d'un onglet — « Demandes » dit son compte quand il en porte un, comme `accessibilityValue` d'iOS. */
export function discoverTabLabel(language: InterfaceLanguage, tab: DiscoverTab, received: number): string {
  if (tab !== 'requests' || received <= 0) return translate(language, TAB_LABEL[tab]);
  const key = received === 1 ? 'discover.tab.requests.count.one' : 'discover.tab.requests.count.other';
  return translate(language, key, { count: unreadBadgeText(received) });
}

/**
 * Flèches gauche/droite, Début et Fin — le motif WAI-ARIA « Tabs » qu'annonce
 * `role="tablist"` (#6422). Un seul onglet est dans l'ordre de tabulation
 * (tabindex itinérant, comme `useRovingMenu`) ; les autres restent
 * atteignables aux flèches. `findFocusableIndex` est la MÊME arithmétique que
 * le menu ancré (`roving-menu.ts`) — aucune ligne désactivée ici, donc
 * `isDisabledAt` reste la constante `false`. En arabe, gauche et droite
 * s'inversent : la flèche qui AVANCE dans le sens de lecture reste la même.
 */
function tabBarKeyDown(event: ReactKeyboardEvent<HTMLButtonElement>, index: number, rtl: boolean, moveTo: (index: number) => void): void {
  const count = DISCOVER_TABS.length;
  const forwardKey = rtl ? 'ArrowLeft' : 'ArrowRight';
  const backwardKey = rtl ? 'ArrowRight' : 'ArrowLeft';
  switch (event.key) {
    case forwardKey:
      moveTo(findFocusableIndex(count, index, 1, () => false));
      break;
    case backwardKey:
      moveTo(findFocusableIndex(count, index, -1, () => false));
      break;
    case 'Home':
      moveTo(findFocusableIndex(count, -1, 1, () => false));
      break;
    case 'End':
      moveTo(findFocusableIndex(count, count, -1, () => false));
      break;
    default:
      return;
  }
  event.preventDefault();
}

/** La barre d'onglets soulignés de `PeopleDiscoveryView.subTabBar` — le compte des reçues sur « Demandes ». */
export function DiscoverTabBar({
  language,
  selected,
  received,
  onSelect,
}: {
  readonly language: InterfaceLanguage;
  readonly selected: DiscoverTab;
  readonly received: number;
  readonly onSelect: (tab: DiscoverTab) => void;
}) {
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const rtl = language === 'ar';
  const moveTo = (index: number) => {
    const tab = DISCOVER_TABS[index];
    if (tab === undefined) return;
    itemRefs.current[index]?.focus();
    onSelect(tab);
  };
  return (
    <div
      role="tablist"
      aria-label={translate(language, 'discover.tabs')}
      className="flex shrink-0 px-2"
      style={{ height: DISCOVER_TABS_HEIGHT, borderBottom: EDGE }}
    >
      {DISCOVER_TABS.map((tab, index) => {
        const active = tab === selected;
        const count = tab === 'requests' ? received : 0;
        return (
          <button
            key={tab}
            type="button"
            role="tab"
            id={`discover-tab-${tab}`}
            ref={(el) => {
              itemRefs.current[index] = el;
            }}
            tabIndex={active ? 0 : -1}
            aria-selected={active}
            aria-controls="contenu"
            aria-label={discoverTabLabel(language, tab, count)}
            data-discover-tab={tab}
            onClick={() => onSelect(tab)}
            onKeyDown={(event) => tabBarKeyDown(event, index, rtl, moveTo)}
            className="relative flex min-w-0 flex-1 items-center justify-center focus-visible:outline-2 focus-visible:-outline-offset-2"
            style={{ minHeight: 44, outlineColor: BRAND }}
          >
            <span
              className={`flex min-w-0 items-center gap-1 text-caption font-semibold ${active ? BRAND_INK : ''}`}
              style={active ? undefined : { color: INK_2 }}
            >
              {/* Sous 360 de large, le glyphe cède sa place au NOM : à 320, « Demandes »
                  et sa pastille ne tenaient plus et se tronquaient (recette). */}
              <span aria-hidden="true" className="hidden shrink-0 place-items-center min-[360px]:grid">
                <TabGlyph tab={tab} />
              </span>
              <span data-discover-tab-title className="truncate">
                {translate(language, TAB_LABEL[tab])}
              </span>
              {count > 0 ? (
                <span
                  aria-hidden="true"
                  data-discover-tab-count={count}
                  className="grid shrink-0 place-items-center rounded-chip font-bold text-white tabular-nums"
                  style={{ minWidth: 18, height: 18, paddingInline: 5, fontSize: 11, lineHeight: 1, backgroundColor: BRAND_FILL }}
                >
                  {unreadBadgeText(count)}
                </span>
              ) : null}
            </span>
            <span
              aria-hidden="true"
              className="absolute inset-x-3 bottom-0 rounded-chip"
              style={{ height: 2, backgroundColor: active ? BRAND_FILL : 'transparent' }}
            />
          </button>
        );
      })}
    </div>
  );
}

function PersonAvatar({ person, name }: { readonly person: PersonSummary | null; readonly name: string }) {
  const avatar = person?.avatar ?? null;
  /* L'AVATAR OUVRE LE PROFIL (#6396) — le critère de fin nommait précisément
     ces lignes : « les lignes de la découverte, des demandes et des bloqués
     l'ouvrent ». Les quatre listes de cet écran passent par ici. */
  const handle = person?.username !== undefined && person.username !== '' ? person.username : undefined;
  return (
    <Avatar
      initials={initialsOf(name)}
      color={colorForName(name)}
      size={44}
      name={name}
      {...(avatar === null ? {} : { src: avatar })}
      {...(handle === undefined ? {} : { profileUsername: handle })}
    />
  );
}

function PersonText({ person, name, children }: { readonly person: PersonSummary | null; readonly name: string; readonly children?: ReactNode }) {
  return (
    <span className="grid min-w-0 flex-1 gap-0.5">
      <span data-person-name className="truncate text-body font-semibold" style={{ color: INK }}>
        {name}
      </span>
      {person === null || person.username === '' ? null : (
        <span data-person-handle className="truncate text-caption font-medium" style={{ color: INK_2 }}>
          @{person.username}
        </span>
      )}
      {children}
    </span>
  );
}

function StatusCapsule({ tone, text, glyph, data }: { readonly tone: Tone; readonly text: string; readonly glyph?: ReactNode; readonly data: string }) {
  return (
    <span
      data-connection={data}
      className="flex h-[30px] shrink-0 items-center gap-1 rounded-chip px-2.5 text-caption font-semibold"
      style={{ color: TONE_INK[tone], backgroundColor: toneFill(tone) }}
    >
      {glyph === undefined ? null : <span aria-hidden="true">{glyph}</span>}
      {text}
    </span>
  );
}

/** Refuser puis accepter — les deux disques de 44 de `RequestsTab.receivedRow`. */
export function RespondButtons({
  language,
  name,
  onAccept,
  onReject,
}: {
  readonly language: InterfaceLanguage;
  readonly name: string;
  readonly onAccept: () => void;
  readonly onReject: () => void;
}) {
  return (
    <span className="flex shrink-0 items-center gap-2">
      <button
        type="button"
        data-request-reject
        aria-label={translate(language, 'discover.connection.rejectLabel', { name })}
        onClick={onReject}
        className={`grid size-11 place-items-center rounded-full ${FOCUS}`}
        style={{ color: INK_2, backgroundColor: FIELD_FILL, outlineColor: BRAND }}
      >
        <Glyph name="x" size={16} />
      </button>
      <button
        type="button"
        data-request-accept
        aria-label={translate(language, 'discover.connection.acceptLabel', { name })}
        onClick={onAccept}
        className={`grid size-11 place-items-center rounded-full text-white ${FOCUS}`}
        style={{
          backgroundImage:
            'linear-gradient(135deg, color-mix(in srgb, var(--color-success) 78%, black), color-mix(in srgb, var(--color-success) 58%, black))',
          outlineColor: BRAND,
        }}
      >
        <Glyph name="check" size={16} />
      </button>
    </span>
  );
}

export type ConnectionHandlers = {
  readonly onAdd: (person: PersonSummary) => void;
  readonly onCancel: (request: FriendRequestRecord) => void;
  readonly onAccept: (request: FriendRequestRecord) => void;
  readonly onReject: (request: FriendRequestRecord) => void;
};

/** `ConnectionActionView` — le geste qu'une ligne de recherche offre, selon ce que la personne EST pour le lecteur. */
export function ConnectionAction({
  language,
  person,
  name,
  relationship,
  handlers,
}: {
  readonly language: InterfaceLanguage;
  readonly person: PersonSummary;
  readonly name: string;
  readonly relationship: Relationship;
  readonly handlers: ConnectionHandlers;
}) {
  switch (relationship.kind) {
    case 'self':
      return null;
    case 'blocked':
      return <StatusCapsule tone="error" data="blocked" text={translate(language, 'discover.connection.blocked')} />;
    case 'friend':
      return (
        <StatusCapsule tone="success" data="friend" glyph={<Glyph name="check" size={11} />} text={translate(language, 'discover.connection.contact')} />
      );
    case 'pendingReceived':
      return (
        <RespondButtons
          language={language}
          name={name}
          onAccept={() => handlers.onAccept(relationship.request)}
          onReject={() => handlers.onReject(relationship.request)}
        />
      );
    case 'pendingSent':
      return (
        <button
          type="button"
          data-connection="pendingSent"
          aria-label={translate(language, 'discover.connection.cancelLabel', { name })}
          onClick={() => handlers.onCancel(relationship.request)}
          className={`grid shrink-0 place-items-center rounded-chip ${FOCUS}`}
          style={{ minHeight: 44, outlineColor: BRAND }}
        >
          <span
            className="flex h-[30px] items-center gap-1 rounded-chip px-2.5 text-caption font-semibold"
            style={{ color: TONE_INK.warning, backgroundColor: toneFill('warning'), boxShadow: `inset 0 0 0 1px color-mix(in srgb, ${TONE_INK.warning} 45%, transparent)` }}
          >
            <Glyph name="clock" size={11} />
            {translate(language, 'discover.connection.pending')}
          </span>
        </button>
      );
    case 'none':
      return (
        <button
          type="button"
          data-connection="none"
          aria-label={translate(language, 'discover.connection.addLabel', { name })}
          onClick={() => handlers.onAdd(person)}
          className={`grid shrink-0 place-items-center rounded-chip ${FOCUS}`}
          style={{ minHeight: 44, outlineColor: BRAND }}
        >
          <span className="flex h-[30px] items-center gap-1 rounded-chip px-3 text-caption font-semibold text-white" style={{ backgroundColor: BRAND_FILL }}>
            <DiscoverGlyph name="userPlus" size={12} />
            {translate(language, 'discover.connection.add')}
          </span>
        </button>
      );
  }
}

/** Une personne rendue par la recherche — `DiscoverTab.searchResultRow`, sans pastille de présence. */
export const PersonResultRow = memo(function PersonResultRow({
  language,
  person,
  relationship,
  handlers,
}: {
  readonly language: InterfaceLanguage;
  readonly person: PersonSummary;
  readonly relationship: Relationship;
  readonly handlers: ConnectionHandlers;
}) {
  const name = personNameOf(person, translate(language, 'discover.unknown'));
  return (
    <li data-person={person.id} data-relationship={relationship.kind} className="flex items-center gap-3.5 py-2.5" style={{ minHeight: PERSON_ROW_HEIGHT }}>
      <PersonAvatar person={person} name={name} />
      <PersonText person={person} name={name} />
      <ConnectionAction language={language} person={person} name={name} relationship={relationship} handlers={handlers} />
    </li>
  );
});

/** Une demande REÇUE — `RequestsTab.receivedRow` : message ou intention, heure, refuser et accepter. */
export const ReceivedRequestRow = memo(function ReceivedRequestRow({
  language,
  request,
  now,
  onAccept,
  onReject,
}: {
  readonly language: InterfaceLanguage;
  readonly request: FriendRequestRecord;
  readonly now: Date;
  readonly onAccept: (request: FriendRequestRecord) => void;
  readonly onReject: (request: FriendRequestRecord) => void;
}) {
  const name = personNameOf(request.sender, translate(language, 'discover.unknown'));
  return (
    <li data-request={request.id} data-request-bucket="received" className="flex items-center gap-3.5 px-5 py-3" style={{ borderBottom: EDGE, minHeight: PERSON_ROW_HEIGHT }}>
      <PersonAvatar person={request.sender} name={name} />
      <PersonText person={request.sender} name={name}>
        <span data-request-message className="line-clamp-2 text-caption" style={{ color: INK_2 }}>
          {request.message ?? translate(language, 'discover.requests.intent')}
        </span>
        <time dateTime={request.createdAt} className="text-caption font-medium" style={{ color: INK_2 }}>
          {shortRelativeTime(new Date(request.createdAt), now, language)}
        </time>
      </PersonText>
      <RespondButtons language={language} name={name} onAccept={() => onAccept(request)} onReject={() => onReject(request)} />
    </li>
  );
});

/** Une demande ENVOYÉE — `RequestsTab.sentRow` : « En attente » et « Annuler ». */
export const SentRequestRow = memo(function SentRequestRow({
  language,
  request,
  now,
  onCancel,
}: {
  readonly language: InterfaceLanguage;
  readonly request: FriendRequestRecord;
  readonly now: Date;
  readonly onCancel: (request: FriendRequestRecord) => void;
}) {
  const name = personNameOf(request.receiver, translate(language, 'discover.unknown'));
  return (
    <li data-request={request.id} data-request-bucket="sent" className="flex items-center gap-3 px-5 py-3" style={{ borderBottom: EDGE, minHeight: PERSON_ROW_HEIGHT }}>
      <PersonAvatar person={request.receiver} name={name} />
      <PersonText person={request.receiver} name={name}>
        <span className="flex min-w-0 items-center gap-1.5">
          <time dateTime={request.createdAt} className="truncate text-caption font-medium" style={{ color: INK_2 }}>
            {shortRelativeTime(new Date(request.createdAt), now, language)}
          </time>
          <StatusCapsule tone="warning" data="pendingSent" glyph={<Glyph name="clock" size={11} />} text={translate(language, 'discover.connection.pending')} />
        </span>
      </PersonText>
      <button
        type="button"
        data-request-cancel
        aria-label={translate(language, 'discover.connection.cancelLabel', { name })}
        onClick={() => onCancel(request)}
        className={`grid shrink-0 place-items-center rounded-chip ${FOCUS}`}
        style={{ minHeight: 44, outlineColor: BRAND }}
      >
        <span
          className="flex h-[30px] items-center rounded-chip px-3 text-caption font-semibold"
          style={{ color: TONE_INK.error, boxShadow: `inset 0 0 0 1px color-mix(in srgb, ${TONE_INK.error} 40%, transparent)` }}
        >
          {translate(language, 'discover.requests.cancel')}
        </span>
      </button>
    </li>
  );
});

/** Une personne BLOQUÉE — `BlockedTab.blockedRow` : « Débloquer » demande confirmation. */
export const BlockedPersonRow = memo(function BlockedPersonRow({
  language,
  person,
  onUnblock,
}: {
  readonly language: InterfaceLanguage;
  readonly person: PersonSummary;
  readonly onUnblock: (person: PersonSummary) => void;
}) {
  const name = personNameOf(person, translate(language, 'discover.unknown'));
  return (
    <li data-blocked={person.id} className="flex items-center gap-3.5 px-5 py-3" style={{ borderBottom: EDGE, minHeight: PERSON_ROW_HEIGHT }}>
      <PersonAvatar person={person} name={name} />
      <PersonText person={person} name={name} />
      <button
        type="button"
        data-unblock
        aria-label={translate(language, 'discover.blocked.unblockLabel', { name })}
        onClick={() => onUnblock(person)}
        className={`grid shrink-0 place-items-center rounded-chip ${FOCUS}`}
        style={{ minHeight: 44, outlineColor: BRAND }}
      >
        <span
          className="flex h-[30px] items-center rounded-chip px-3 text-caption font-semibold"
          style={{ color: TONE_INK.warning, boxShadow: `inset 0 0 0 1px color-mix(in srgb, ${TONE_INK.warning} 40%, transparent)` }}
        >
          {translate(language, 'discover.blocked.unblock')}
        </span>
      </button>
    </li>
  );
});

/** Le filtre de `RequestsTab.filterPills` : « Reçues (3) », « Envoyées (1) ». */
export function RequestFilterRail({
  language,
  selected,
  counts,
  onSelect,
}: {
  readonly language: InterfaceLanguage;
  readonly selected: RequestFilter;
  readonly counts: Readonly<Record<RequestFilter, number>>;
  readonly onSelect: (filter: RequestFilter) => void;
}) {
  return (
    <div role="group" aria-label={translate(language, 'discover.requests.filters')} className="flex shrink-0 items-center gap-2 px-4 py-1.5">
      {REQUEST_FILTERS.map((filter) => {
        const pressed = filter === selected;
        const title = translate(language, filter === 'received' ? 'discover.requests.received' : 'discover.requests.sent');
        const count = counts[filter];
        return (
          <button
            key={filter}
            type="button"
            data-request-filter={filter}
            aria-pressed={pressed}
            onClick={() => onSelect(filter)}
            className="grid shrink-0 place-items-center rounded-chip focus-visible:outline-2"
            style={{ minHeight: 44, outlineColor: BRAND }}
          >
            <span
              className={`grid h-[30px] place-items-center rounded-chip px-3.5 text-caption font-semibold ${pressed ? '' : BRAND_INK}`}
              style={
                pressed
                  ? { color: 'white', backgroundColor: BRAND_FILL }
                  : { boxShadow: 'inset 0 0 0 1px color-mix(in srgb, var(--ios-indigo-600) 35%, transparent)' }
              }
            >
              {count > 0 ? `${title} (${unreadBadgeText(count)})` : title}
            </span>
          </button>
        );
      })}
    </div>
  );
}

export type InviteStatus = 'idle' | 'sending' | 'sent' | 'invalid' | 'conflict' | 'offline' | 'error';

const INVITE_FEEDBACK = {
  invalid: 'discover.invite.invalid',
  conflict: 'discover.invite.conflict',
  offline: 'discover.invite.offline',
  error: 'discover.invite.error',
} as const;

/** `DiscoverTab.emailInviteCard` — l'adresse, « Envoyer », et ce que la passerelle a répondu, sous le champ. */
export function InviteCard({
  language,
  email,
  sentTo,
  status,
  onEmailChange,
  onSubmit,
}: {
  readonly language: InterfaceLanguage;
  readonly email: string;
  readonly sentTo: string;
  readonly status: InviteStatus;
  readonly onEmailChange: (email: string) => void;
  readonly onSubmit: () => void;
}) {
  const fieldId = useId();
  const feedbackId = useId();
  const feedback =
    status === 'sent'
      ? translate(language, 'discover.invite.sent', { email: sentTo })
      : status === 'idle' || status === 'sending'
        ? null
        : translate(language, INVITE_FEEDBACK[status]);
  const failed = status !== 'sent' && feedback !== null;
  return (
    <form
      data-discover-invite
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
      className="mx-4 grid gap-2.5 rounded-card p-3.5"
      style={{ backgroundColor: 'var(--color-ios-card)', boxShadow: EDGE.replace('1px solid', '0 0 0 1px') }}
    >
      <label htmlFor={fieldId} className="flex items-center gap-2 text-body font-semibold" style={{ color: INK }}>
        <span aria-hidden="true" style={{ color: BRAND }}>
          <DiscoverGlyph name="envelopeSimple" size={16} />
        </span>
        {translate(language, 'discover.invite.title')}
      </label>
      <div className="flex items-center gap-2.5">
        <input
          id={fieldId}
          type="email"
          inputMode="email"
          autoComplete="email"
          autoCapitalize="none"
          spellCheck={false}
          data-discover-invite-email
          placeholder={translate(language, 'discover.invite.placeholder')}
          value={email}
          onInput={(event) => onEmailChange(event.currentTarget.value)}
          aria-invalid={status === 'invalid' || status === 'conflict'}
          {...(feedback === null ? {} : { 'aria-describedby': feedbackId })}
          className="min-w-0 flex-1 rounded-[10px] px-3 text-body focus-visible:outline-2"
          style={{ minHeight: 44, color: INK, backgroundColor: FIELD_FILL, outlineColor: BRAND }}
        />
        <button
          type="submit"
          data-discover-invite-send
          disabled={email.trim() === '' || status === 'sending'}
          aria-label={translate(language, 'discover.invite.sendLabel')}
          className={`grid shrink-0 place-items-center rounded-chip px-4 text-caption font-semibold text-white disabled:opacity-60 ${FOCUS}`}
          style={{ minHeight: 44, backgroundColor: BRAND_FILL, outlineColor: BRAND }}
        >
          {translate(language, status === 'sending' ? 'discover.invite.sending' : 'discover.invite.send')}
        </button>
      </div>
      {feedback === null ? null : (
        <p
          id={feedbackId}
          role={failed ? 'alert' : 'status'}
          data-discover-invite-feedback={status}
          className="text-caption font-medium"
          style={{ color: failed ? TONE_INK.error : TONE_INK.success }}
        >
          {feedback}
        </p>
      )}
    </form>
  );
}

/**
 * `DiscoverTab.searchBar` — la loupe, le champ, « effacer » dès qu'il y a une
 * saisie. Posé dans `Field`, le champ commun (bord de focus, icône), comme la
 * recherche des communautés ; un `type="search"` natif aurait ajouté la croix
 * du navigateur à côté de la nôtre — deux « effacer » pour un geste.
 */
export function DiscoverSearchField({
  language,
  value,
  onChange,
}: {
  readonly language: InterfaceLanguage;
  readonly value: string;
  readonly onChange: (value: string) => void;
}) {
  const [focused, setFocused] = useState(false);
  return (
    <Field id="discover-search" icon="magnifyingGlass" tint={BRAND} focused={focused}>
      {({ id, describedBy }) => (
        <>
          <input
            id={id}
            type="text"
            role="searchbox"
            inputMode="search"
            enterKeyHint="search"
            autoCapitalize="none"
            autoComplete="off"
            spellCheck={false}
            data-discover-search
            aria-describedby={describedBy}
            aria-label={translate(language, 'discover.search.label')}
            placeholder={translate(language, 'discover.search.label')}
            value={value}
            onChange={(event) => onChange(event.currentTarget.value)}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            className="min-w-0 flex-1 bg-transparent text-body outline-none"
            style={{ minHeight: 44, color: INK }}
          />
          {value === '' ? null : (
            <button
              type="button"
              data-discover-search-clear
              aria-label={translate(language, 'discover.search.clear')}
              onClick={() => onChange('')}
              className="-me-3 grid size-11 shrink-0 place-items-center rounded-chip focus-visible:outline-2"
              style={{ color: INK_2, outlineColor: BRAND }}
            >
              <Glyph name="x" size={14} />
            </button>
          )}
        </>
      )}
    </Field>
  );
}

export function DiscoverEmpty({
  glyph,
  title,
  subtitle,
  data,
}: {
  readonly glyph: ReactNode;
  readonly title: string;
  readonly subtitle: string;
  readonly data: string;
}) {
  return (
    <div data-discover-empty={data} className="grid flex-1 content-center justify-items-center gap-3 px-6 py-10 text-center">
      <span aria-hidden="true" style={{ color: BRAND }}>
        {glyph}
      </span>
      <p className="text-body font-semibold" style={{ color: INK }}>
        {title}
      </p>
      <p className="text-caption" style={{ color: INK_2 }}>
        {subtitle}
      </p>
    </div>
  );
}

/** Erreur À CACHE VIDE — sur un cache non vide, la liste reste. */
export function DiscoverError({ language, online, onRetry }: { readonly language: InterfaceLanguage; readonly online: boolean; readonly onRetry: () => void }) {
  return (
    <div role="alert" data-discover-error className="grid flex-1 content-center justify-items-center gap-3 px-6 py-10 text-center">
      <span style={{ color: TONE_INK.error }}>
        <Glyph name="warningCircle" size={28} />
      </span>
      <p className="text-body font-semibold" style={{ color: INK }}>
        {translate(language, online ? 'discover.error.title' : 'discover.offline.title')}
      </p>
      <p className="text-caption" style={{ color: INK_2 }}>
        {translate(language, online ? 'discover.error.body' : 'discover.offline.body')}
      </p>
      <button
        type="button"
        data-discover-retry
        onClick={onRetry}
        className={`grid place-items-center rounded-chip px-5 text-body font-semibold text-white ${FOCUS}`}
        style={{ backgroundColor: BRAND_FILL, minHeight: 44, outlineColor: BRAND }}
      >
        {translate(language, 'discover.retry')}
      </button>
    </div>
  );
}

/**
 * Hors ligne. Sur un cache non vide, la liste reste et l'annonce le dit ; à
 * cache FROID (#6419), rien n'a jamais été chargé : l'annonce dit ce qui se
 * passera au retour du réseau, jamais « la liste du dernier chargement ».
 */
export function DiscoverOfflineNotice({ language, cold }: { readonly language: InterfaceLanguage; readonly cold: boolean }) {
  return (
    <div role="status" data-discover-offline={cold ? 'cold' : 'cached'} className="flex items-start gap-3 px-5 py-3" style={{ borderBottom: EDGE }}>
      <span aria-hidden="true" className="pt-0.5" style={{ color: TONE_INK.warning }}>
        <Glyph name="warningCircle" size={18} />
      </span>
      <span className="grid gap-0.5">
        <span className="text-body font-semibold" style={{ color: INK }}>
          {translate(language, 'discover.offline.title')}
        </span>
        <span className="text-caption" style={{ color: INK_2 }}>
          {translate(language, cold ? 'discover.offline.cold.body' : 'discover.offline.body')}
        </span>
      </span>
    </div>
  );
}

const SKELETON_ROWS = [0, 1, 2, 3] as const;

export function DiscoverSkeleton() {
  return (
    <div aria-hidden="true" data-discover-skeleton className="flex flex-col">
      {SKELETON_ROWS.map((i) => (
        <div key={i} className="flex items-center gap-3.5 px-5 py-3" style={{ borderBottom: EDGE, minHeight: PERSON_ROW_HEIGHT }}>
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

/**
 * **LA CONFIRMATION DE DÉBLOCAGE VIT DÉSORMAIS DANS `ConfirmDialog`**
 * (revue-correction #6149, défaut majeur 2, issue #7858) — c'était la
 * SECONDE copie divergente du dépôt : `<dialog>` + `showModal()` recopiés,
 * un geste destructif en blanc sur `--color-warning` mêlé de noir. Le composant
 * partagé (`components/confirm-dialog.tsx`) est monté directement par
 * `routes/discover.tsx`, qui porte déjà le NOM (« celui qu'on débloque »)
 * dans ses libellés.
 */
