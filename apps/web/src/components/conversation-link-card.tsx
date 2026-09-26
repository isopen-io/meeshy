import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type CSSProperties, type MouseEvent, type ReactNode } from 'react';

import type { ConversationCard, ConversationCardInviter } from '@meeshy/shared/types/conversation-card';
import { colorForName } from '@meeshy/shared/utils/conversation-colors';

import { inkOnAccent } from '@/lib/accent';
import {
  cardWithMembership,
  conversationCardQueryKey,
  conversationCardQueryOptions,
  leaveConversation,
  type ConversationCardDeps,
} from '@/lib/api/conversation-card';
import { CONVERSATIONS_QUERY_KEY } from '@/lib/api/conversations';
import { joinLinkAsMember } from '@/lib/api/link-join';
import { translate } from '@/lib/i18n-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';
import { languageName } from '@/lib/languages';
import type { ConversationLinkTarget } from '@/lib/links/conversation-link';
import { initialsOf } from '@/lib/view/conversation';
import { Link } from '@/routes/route-table';

import { ConfirmDialog } from './confirm-dialog';
import { GlyphSvg } from './glyph';
import { GLYPHS } from './glyphs';

/**
 * **LA CARTE DE CONVERSATION D'UNE BULLE** (#8099) — directive porteur
 * 2026-09-26 : la citation de l'invitation (qui invite, et son message), puis
 * la carte du groupe (bannière, avatar en chevauchement, titre, description
 * courte, statistiques), puis les actions :
 *
 * - non-membre, lien actif : « Rejoindre » pleine largeur — ou, pour un
 *   visiteur SANS compte sur un lien qui l'accepte, « Rejoindre en anonyme »
 *   puis « Rejoindre » côte à côte ;
 * - membre : « Quitter » EN PREMIER (secondaire, destructif, confirmé), puis
 *   « Ouvrir » ;
 * - lien clos : carte grisée « Lien expiré », aucune action ;
 * - lien direct refusé (404, qu'il n'existe pas ou qu'on n'en soit pas) :
 *   carte neutre « Conversation privée », aucune action.
 *
 * Référence : `ConversationLinkCard.swift` (iOS, même lot) — bannière de 76,
 * avatar de 52 à coins de 14, accent `colorForName(id ?? lien ?? titre)`.
 *
 * **« Rejoindre en anonyme » n'est offert qu'à un visiteur SANS compte** : un
 * compte connecté qui ouvre `/chat/<lien>` n'y trouve que la jonction par son
 * compte (`joinChoicesOf`) — lui proposer l'anonyme serait un contrôle qui
 * ment (loi 4).
 *
 * **Optimiste** : Rejoindre et Quitter basculent la carte au geste, puis
 * reviennent en arrière et le disent si la passerelle refuse.
 */

const BANNER_HEIGHT = 76;
const AVATAR_SIDE = 52;
const VISIBLE_LANGUAGES = 4;
const MIN_TARGET = 44;

const INK = 'var(--color-ios-ink)';
const INK_2 = 'var(--color-ios-ink-2)';
const EDGE = '1px solid var(--color-edge)';

type Pending = 'join' | 'leave' | null;
type Failure = 'join' | 'leave' | null;

export type ConversationLinkCardProps = {
  readonly target: ConversationLinkTarget;
  readonly deps: ConversationCardDeps;
  readonly language: InterfaceLanguage;
  readonly signedIn: boolean;
  readonly accountLanguage: string | null;
};

/** Un clic dans la carte ne remonte pas jusqu'aux gestes de la bulle. */
const contained = (event: MouseEvent) => event.stopPropagation();

const cardShell: CSSProperties = {
  width: '100%',
  maxWidth: 300,
  borderRadius: 12,
  border: EDGE,
  backgroundColor: 'var(--color-ios-card)',
  color: INK,
  overflow: 'hidden',
};

export function ConversationLinkCard({ target, deps, language, signedIn, accountLanguage }: ConversationLinkCardProps) {
  const queryClient = useQueryClient();
  const query = useQuery(conversationCardQueryOptions(deps, target));
  const [pending, setPending] = useState<Pending>(null);
  const [failure, setFailure] = useState<Failure>(null);
  const [confirmingLeave, setConfirmingLeave] = useState(false);
  const key = conversationCardQueryKey(target);

  if (query.data === undefined) {
    if (query.isError) {
      return (
        <div data-conversation-card="error" className="mt-1.5 grid gap-2 p-3" style={cardShell} onClick={contained}>
          <p className="text-mini" style={{ color: INK_2 }}>
            {translate(language, 'conversation.card.error')}
          </p>
          <button
            type="button"
            onClick={() => void query.refetch()}
            className="rounded-chip text-body font-semibold focus-visible:outline-2 focus-visible:outline-offset-2"
            style={{ minHeight: MIN_TARGET, border: EDGE, color: INK, outlineColor: 'var(--color-ios-brand)' }}
          >
            {translate(language, 'conversation.card.retry')}
          </button>
        </div>
      );
    }
    return <CardSkeleton language={language} />;
  }

  if (query.data === null) {
    const isDirect = target.kind === 'direct';
    return (
      <ClosedNotice
        kind={isDirect ? 'private' : 'notFound'}
        title={translate(language, isDirect ? 'conversation.card.private' : 'conversation.card.notFound')}
        body={translate(language, isDirect ? 'conversation.card.private.body' : 'conversation.card.notFound.body')}
      />
    );
  }

  const card = query.data;
  const accent = colorForName(card.conversationId ?? card.link?.identifier ?? card.title);
  const expired = card.link !== null && !card.link.isActive;

  const join = async () => {
    const link = card.link?.identifier;
    if (link === undefined || pending !== null) return;
    setFailure(null);
    setPending('join');
    queryClient.setQueryData(key, cardWithMembership(card, { isMember: true, conversationId: card.conversationId }));
    const result = await joinLinkAsMember(deps, { link, language: accountLanguage });
    setPending(null);
    if (!result.ok) {
      queryClient.setQueryData(key, card);
      setFailure('join');
      return;
    }
    queryClient.setQueryData(key, cardWithMembership(card, { isMember: true, conversationId: result.data.conversationId }));
    void queryClient.invalidateQueries({ queryKey: CONVERSATIONS_QUERY_KEY });
  };

  const leave = async () => {
    const conversationId = card.conversationId;
    setConfirmingLeave(false);
    if (conversationId === null || pending !== null) return;
    setFailure(null);
    setPending('leave');
    queryClient.setQueryData(key, cardWithMembership(card, { isMember: false, conversationId: null }));
    const result = await leaveConversation(deps, conversationId);
    setPending(null);
    if (!result.ok) {
      queryClient.setQueryData(key, card);
      setFailure('leave');
      return;
    }
    void queryClient.invalidateQueries({ queryKey: CONVERSATIONS_QUERY_KEY });
  };

  return (
    <section
      data-conversation-card={expired ? 'expired' : card.viewer.isMember ? 'member' : 'guest'}
      aria-label={translate(language, 'conversation.card.a11y', { title: card.title })}
      className="mt-1.5 grid gap-2"
      style={{ width: '100%', maxWidth: 300 }}
      onClick={contained}
    >
      {card.kind === 'share-link' && card.inviter !== null && !expired ? (
        <InviteQuote inviter={card.inviter} message={card.inviteMessage} accent={accent} language={language} />
      ) : null}
      <div style={{ ...cardShell, ...(expired ? { filter: 'grayscale(1)', opacity: 0.6 } : {}) }}>
        <GroupBody card={card} accent={accent} language={language} expired={expired} />
      </div>
      <Actions
        card={card}
        accent={accent}
        language={language}
        signedIn={signedIn}
        expired={expired}
        pending={pending}
        onJoin={() => void join()}
        onLeave={() => setConfirmingLeave(true)}
      />
      {failure !== null ? (
        <p role="alert" className="text-mini" style={{ color: 'var(--color-error)' }}>
          {translate(language, failure === 'join' ? 'conversation.card.join.error' : 'conversation.card.leave.error')}
        </p>
      ) : null}
      {confirmingLeave ? (
        <ConfirmDialog
          name="conversation-card-leave"
          title={translate(language, 'conversation.card.leave.confirm.title', { title: card.title })}
          body={translate(language, 'conversation.card.leave.confirm.body')}
          cancelLabel={translate(language, 'conversation.card.cancel')}
          confirmLabel={translate(language, 'conversation.card.leave')}
          tone="destructive"
          onConfirm={() => void leave()}
          onCancel={() => setConfirmingLeave(false)}
        />
      ) : null}
    </section>
  );
}

function CardSkeleton({ language }: { readonly language: InterfaceLanguage }) {
  const bar = (width: string): CSSProperties => ({
    height: 10,
    width,
    borderRadius: 5,
    backgroundColor: 'color-mix(in srgb, var(--color-ios-ink-3) 25%, transparent)',
  });
  return (
    <div
      data-conversation-card="loading"
      role="status"
      aria-busy="true"
      aria-label={translate(language, 'conversation.card.loading')}
      className="mt-1.5 grid gap-2 pb-3"
      style={cardShell}
    >
      <div style={{ height: BANNER_HEIGHT, backgroundColor: 'color-mix(in srgb, var(--color-ios-ink-3) 18%, transparent)' }} />
      <div className="grid gap-2 px-3">
        <div style={bar('60%')} />
        <div style={bar('85%')} />
        <div style={bar('40%')} />
      </div>
    </div>
  );
}

function ClosedNotice({ kind, title, body }: { readonly kind: 'private' | 'notFound'; readonly title: string; readonly body: string }) {
  return (
    <div data-conversation-card={kind} className="mt-1.5 flex items-center gap-3 p-3" style={cardShell}>
      <span
        aria-hidden="true"
        className="grid shrink-0 place-items-center"
        style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: 'color-mix(in srgb, var(--color-ios-ink-3) 18%, transparent)', color: INK_2 }}
      >
        <GlyphSvg glyph={kind === 'private' ? GLYPHS.lock : GLYPHS.linkSimple} size={20} />
      </span>
      <span className="grid min-w-0">
        <span className="text-title font-semibold">{title}</span>
        <span className="text-mini" style={{ color: INK_2 }}>
          {body}
        </span>
      </span>
    </div>
  );
}

function InviteQuote({
  inviter,
  message,
  accent,
  language,
}: {
  readonly inviter: ConversationCardInviter;
  readonly message: string | null;
  readonly accent: string;
  readonly language: InterfaceLanguage;
}) {
  return (
    <figure data-conversation-card-invite className="m-0 flex gap-2.5">
      <span aria-hidden="true" style={{ width: 3, borderRadius: 2, backgroundColor: accent, flexShrink: 0 }} />
      <span className="grid min-w-0 gap-1">
        <figcaption className="flex min-w-0 items-center gap-2">
          <Portrait src={inviter.avatarUrl} name={inviter.displayName} accent={accent} size={24} radius={12} />
          <span className="min-w-0 text-mini" style={{ color: INK_2 }}>
            <strong className="font-bold" style={{ color: INK }}>
              {inviter.displayName}
            </strong>{' '}
            {translate(language, 'conversation.card.invite.lead')}
          </span>
        </figcaption>
        {message !== null ? (
          <blockquote className="m-0 text-body italic" style={{ color: INK }}>
            {message}
          </blockquote>
        ) : null}
      </span>
    </figure>
  );
}

function Portrait({
  src,
  name,
  accent,
  size,
  radius,
  ring,
}: {
  readonly src: string | null;
  readonly name: string;
  readonly accent: string;
  readonly size: number;
  readonly radius: number;
  readonly ring?: string;
}) {
  const style: CSSProperties = {
    width: size,
    height: size,
    borderRadius: radius,
    flexShrink: 0,
    overflow: 'hidden',
    ...(ring === undefined ? {} : { border: `2px solid ${ring}` }),
  };
  if (src !== null) return <img src={src} alt="" aria-hidden="true" loading="lazy" style={{ ...style, objectFit: 'cover' }} />;
  return (
    <span
      aria-hidden="true"
      className="grid place-items-center font-extrabold"
      style={{ ...style, backgroundColor: accent, color: inkOnAccent(accent), fontSize: Math.round(size * 0.36) }}
    >
      {initialsOf(name)}
    </span>
  );
}

function GroupBody({
  card,
  accent,
  language,
  expired,
}: {
  readonly card: ConversationCard;
  readonly accent: string;
  readonly language: InterfaceLanguage;
  readonly expired: boolean;
}) {
  const banner: CSSProperties = {
    height: BANNER_HEIGHT,
    backgroundColor: card.bannerUrl !== null ? accent : 'var(--color-ios-card)',
    backgroundImage:
      card.bannerUrl !== null
        ? `url("${encodeURI(card.bannerUrl)}")`
        : `linear-gradient(135deg, ${accent}, color-mix(in srgb, ${accent} 55%, var(--color-ios-card)))`,
    backgroundSize: 'cover',
    backgroundPosition: 'center',
  };
  return (
    <div className="grid gap-1.5 pb-3">
      <div aria-hidden="true" style={banner} />
      <div className="flex items-end gap-2.5 px-3" style={{ marginTop: -AVATAR_SIDE / 2 }}>
        <Portrait src={card.avatarUrl} name={card.title} accent={accent} size={AVATAR_SIDE} radius={14} ring="var(--color-ios-card)" />
        <h3 className="m-0 min-w-0 pb-0.5 text-title font-extrabold" style={{ overflowWrap: 'anywhere' }}>
          {card.title}
        </h3>
      </div>
      {card.description !== null ? (
        <p
          className="m-0 px-3 text-mini"
          style={{ color: INK_2, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}
        >
          {card.description}
        </p>
      ) : null}
      {expired ? (
        <p className="m-0 px-3 text-mini font-semibold" style={{ color: INK_2 }}>
          {translate(language, 'conversation.card.expired')} · {translate(language, 'conversation.card.expired.body')}
        </p>
      ) : (
        <Stats card={card} accent={accent} language={language} />
      )}
    </div>
  );
}

function Stats({ card, accent, language }: { readonly card: ConversationCard; readonly accent: string; readonly language: InterfaceLanguage }) {
  const { memberCount, messageCount, languages } = card.stats;
  const figures = [
    translate(language, memberCount === 1 ? 'conversation.card.members.one' : 'conversation.card.members.other', {
      count: String(memberCount),
    }),
    ...(messageCount === null
      ? []
      : [
          translate(language, messageCount === 1 ? 'conversation.card.messages.one' : 'conversation.card.messages.other', {
            count: String(messageCount),
          }),
        ]),
  ];
  const shown = languages.slice(0, VISIBLE_LANGUAGES);
  const hidden = languages.length - shown.length;
  return (
    <div className="grid gap-1.5 px-3">
      <p className="m-0 text-mini font-semibold" style={{ color: INK_2 }}>
        {figures.join(' · ')}
      </p>
      {shown.length > 0 ? (
        <ul aria-label={translate(language, 'conversation.card.languages')} className="m-0 flex flex-wrap gap-1 p-0" style={{ listStyle: 'none' }}>
          {shown.map((code) => (
            <li
              key={code}
              data-card-language={code}
              title={languageName(code)}
              className="rounded-full px-1.5 text-[11px] font-bold"
              style={{ backgroundColor: `color-mix(in srgb, ${accent} 14%, transparent)`, color: INK }}
            >
              {code.toUpperCase()}
            </li>
          ))}
          {hidden > 0 ? (
            <li className="px-1 text-[11px] font-bold" style={{ color: INK_2 }}>
              +{hidden}
            </li>
          ) : null}
        </ul>
      ) : null}
    </div>
  );
}

const primaryStyle = (accent: string): CSSProperties => ({
  minHeight: MIN_TARGET,
  backgroundColor: accent,
  color: inkOnAccent(accent),
  outlineColor: 'var(--color-ios-brand)',
});

const secondaryStyle = (ink: string): CSSProperties => ({
  minHeight: MIN_TARGET,
  border: EDGE,
  backgroundColor: 'var(--color-ios-card)',
  color: ink,
  outlineColor: 'var(--color-ios-brand)',
});

const BUTTON = 'grid flex-1 place-items-center rounded-chip px-3 text-center text-body leading-tight font-bold focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-60';

function Row({ children }: { readonly children: ReactNode }) {
  return <div className="flex gap-2">{children}</div>;
}

function Actions({
  card,
  accent,
  language,
  signedIn,
  expired,
  pending,
  onJoin,
  onLeave,
}: {
  readonly card: ConversationCard;
  readonly accent: string;
  readonly language: InterfaceLanguage;
  readonly signedIn: boolean;
  readonly expired: boolean;
  readonly pending: Pending;
  readonly onJoin: () => void;
  readonly onLeave: () => void;
}) {
  if (expired) return null;

  if (card.viewer.isMember) {
    /* Pendant une jonction optimiste, l'identifiant de la conversation n'est
       pas encore connu : les deux gestes sont là, inertes le temps de la
       réponse — jamais un lien vers une adresse qui n'existe pas. */
    const conversationId = card.conversationId;
    return (
      <Row>
        <button
          type="button"
          onClick={onLeave}
          disabled={pending !== null || conversationId === null}
          aria-busy={pending === 'leave'}
          className={BUTTON}
          style={secondaryStyle('var(--color-error)')}
        >
          {pending === 'leave' ? translate(language, 'conversation.card.leaving') : translate(language, 'conversation.card.leave')}
        </button>
        {conversationId === null ? (
          <button type="button" disabled aria-busy={pending === 'join'} className={BUTTON} style={primaryStyle(accent)}>
            {translate(language, 'conversation.card.open')}
          </button>
        ) : (
          <Link to="thread" params={{ conversation: conversationId }} className={BUTTON} style={primaryStyle(accent)}>
            {translate(language, 'conversation.card.open')}
          </Link>
        )}
      </Row>
    );
  }

  const identifier = card.link?.identifier;
  if (!card.viewer.canJoin || identifier === undefined) return null;

  if (!signedIn) {
    const next = `/chat/${encodeURIComponent(identifier)}`;
    return (
      <Row>
        {card.viewer.canJoinAnonymously ? (
          <Link to="chatJoin" params={{ link: identifier }} className={BUTTON} style={secondaryStyle(INK)}>
            {translate(language, 'conversation.card.joinAnonymously')}
          </Link>
        ) : null}
        <Link
          to="login"
          search={{ next }}
          data-full-width={card.viewer.canJoinAnonymously ? undefined : 'true'}
          className={BUTTON}
          style={primaryStyle(accent)}
        >
          {translate(language, 'conversation.card.join')}
        </Link>
      </Row>
    );
  }

  return (
    <Row>
      <button
        type="button"
        onClick={onJoin}
        disabled={pending !== null}
        aria-busy={pending === 'join'}
        data-full-width="true"
        className={BUTTON}
        style={primaryStyle(accent)}
      >
        {translate(language, 'conversation.card.join')}
      </button>
    </Row>
  );
}
