import { useInfiniteQuery } from '@tanstack/react-query';
import { useId, useState } from 'react';

import {
  conversationMembersQueryOptions,
  flattenConversationMembers,
  memberFromParticipant,
  type ConversationMember,
} from '@/lib/api/conversation-members';
import type { ConversationsDeps } from '@/lib/api/conversations';
import type { Conversation } from '@/lib/api/types';
import { translate, type InterfaceCatalogKey } from '@/lib/i18n-catalog';
import { currentInterfaceLanguage } from '@/lib/interface-language';
import { avatarMenuEntries } from '@/lib/view/avatar-menu';
import { avatarOf, initialsOf } from '@/lib/view/conversation';
import { shareConversationLink, type ConversationShareOutcome } from '@/lib/view/conversation-share-link';
import type { PortailPartage } from '@/lib/view/invitation';
import { canCreateShareLink } from '@/lib/view/share-link-eligibility';
import type { StoryRingOf } from '@/lib/view/use-author-story-rings';
import { peekProfileOnClick } from '@/lib/view/profile-peek';
import { Link } from '@/routes/route-table';

import { Avatar } from './avatar';
import { AvatarMenuTrigger } from './avatar-menu';
import { Glyph } from './glyph';
import { Sheet } from './sheet';

/**
 * **LES DÉTAILS D'UNE CONVERSATION** (#7829) — premier incrément de
 * `ConversationInfoSheet.swift` : l'EN-TÊTE (photo, nom, description, type,
 * nombre de membres), l'action « Partager un lien » et l'onglet « Membres ».
 * Médias (#7834), statistiques (#7835), options (#7836) et « Quitter »
 * (#7837) ne sont pas encore portés.
 *
 * Une FEUILLE du fil, pas une adresse (D-118) : comme sur iOS, elle se pose
 * au-dessus du fil qui garde son défilement, le retour matériel la referme
 * (`Sheet` → `useBackDismiss`), et tout ce qu'elle peint d'abord est DÉJÀ dans
 * la mémoire du fil — la conversation et ses participants en cache.
 *
 * CACHE D'ABORD : les participants que la conversation porte (cinq au plus
 * dans la liste) se peignent à l'ouverture ; la page de la passerelle les
 * remplace quand elle arrive. Le squelette ne paraît que si le cache est VIDE.
 */
type TypeKey = Extract<InterfaceCatalogKey, `conversation.details.type.${string}`>;
type RoleKey = Extract<InterfaceCatalogKey, `conversation.details.role.${string}`>;

const TYPE_KEYS: Readonly<Record<Conversation['type'], TypeKey>> = {
  direct: 'conversation.details.type.direct',
  group: 'conversation.details.type.group',
  public: 'conversation.details.type.public',
  global: 'conversation.details.type.global',
  broadcast: 'conversation.details.type.broadcast',
};

const ROLE_KEYS: Readonly<Record<string, RoleKey>> = {
  creator: 'conversation.details.role.creator',
  admin: 'conversation.details.role.admin',
  moderator: 'conversation.details.role.moderator',
};

const MEMBER_AVATAR = 40;
const ROW_MIN_HEIGHT = 56;

type ShareState = { readonly busy: boolean; readonly feedback: string | null };

const feedbackOf = (outcome: ConversationShareOutcome, language: ReturnType<typeof currentInterfaceLanguage>): string | null => {
  switch (outcome.kind) {
    case 'shared':
    case 'cancelled':
      return null;
    case 'copied':
      return translate(language, 'conversation.details.share.copied');
    case 'failed':
      return translate(language, 'conversation.details.share.failed');
    case 'unavailable':
      return translate(language, 'conversation.details.share.unavailable', { url: outcome.url });
  }
};

export function ConversationDetailsSheet({
  conversation,
  title,
  accent,
  viewerId,
  storyRingOf,
  deps,
  origin,
  portail,
  onClose,
}: {
  readonly conversation: Conversation;
  readonly title: string;
  readonly accent: string;
  readonly viewerId: string;
  readonly storyRingOf?: StoryRingOf | undefined;
  readonly deps: ConversationsDeps;
  readonly origin: string;
  readonly portail?: PortailPartage | undefined;
  readonly onClose: () => void;
}) {
  const language = currentInterfaceLanguage();
  const membersHeadingId = useId();
  const query = useInfiniteQuery(conversationMembersQueryOptions(deps, conversation.id));
  const served = flattenConversationMembers(query.data);
  const members = served ?? conversation.participants.map(memberFromParticipant);
  const total = query.data?.pages[0]?.totalCount ?? conversation.memberCount;
  const capped = query.data === undefined && conversation.memberCountCapped === true;
  const countLabel = translate(language, total === 1 ? 'conversation.details.members.one' : 'conversation.details.members.other', {
    count: `${total}${capped ? '+' : ''}`,
  });
  const photo = avatarOf(conversation, viewerId);
  const description = conversation.description?.trim() ?? '';

  const [share, setShare] = useState<ShareState>({ busy: false, feedback: null });
  const onShare = async () => {
    setShare({ busy: true, feedback: null });
    const outcome = await shareConversationLink({
      deps,
      conversationId: conversation.id,
      origin,
      ...(portail === undefined ? {} : { portail }),
    });
    setShare({ busy: false, feedback: feedbackOf(outcome, language) });
  };

  return (
    <Sheet title={translate(language, 'conversation.details.title')} bodyAs="div" onClose={onClose}>
      <div className="flex-1 overflow-y-auto" data-conversation-details>
        <header className="flex flex-col items-center gap-2 px-4 pt-4 pb-6 text-center">
          <Avatar initials={initialsOf(title)} color={accent} size={88} name={title} {...(photo === undefined ? {} : { src: photo })} />
          <h3 className="text-section font-bold" style={{ color: 'var(--color-ios-ink)' }} data-conversation-details-name>
            {title}
          </h3>
          {description === '' ? null : (
            <p className="text-body" style={{ color: 'var(--color-ios-ink-2)' }} data-conversation-details-description>
              {description}
            </p>
          )}
          <p className="text-caption" style={{ color: 'var(--color-ios-ink-2)' }} data-conversation-details-meta>
            {translate(language, TYPE_KEYS[conversation.type])} · {countLabel}
          </p>
        </header>

        {canCreateShareLink(conversation) ? (
          <div className="flex flex-col items-center gap-2 px-4 pb-6">
            <button
              type="button"
              disabled={share.busy}
              aria-busy={share.busy}
              onClick={() => void onShare()}
              data-conversation-details-share
              className="flex items-center gap-2 rounded-chip px-4 font-semibold disabled:opacity-50"
              style={{ minHeight: 44, color: 'white', backgroundColor: 'var(--accent)' }}
            >
              <Glyph name="linkSimple" size={18} />
              {share.busy ? translate(language, 'conversation.details.share.busy') : translate(language, 'conversation.details.share')}
            </button>
            <p role="status" aria-live="polite" className="text-caption" style={{ color: 'var(--color-ios-ink-2)' }}>
              {share.feedback ?? ''}
            </p>
          </div>
        ) : null}

        <section aria-labelledby={membersHeadingId} className="pb-6">
          <h4 id={membersHeadingId} className="px-4 pb-2 text-caption font-semibold uppercase" style={{ color: 'var(--color-ios-ink-2)' }}>
            {translate(language, 'conversation.details.members.section')}
          </h4>
          <MembersBody
            members={members}
            pending={query.isPending}
            failed={query.isError}
            onRetry={() => void query.refetch()}
            viewerId={viewerId}
            accent={accent}
            {...(storyRingOf === undefined ? {} : { storyRingOf })}
          />
          {query.hasNextPage === true ? (
            <div className="flex justify-center px-4 pt-2">
              <button
                type="button"
                disabled={query.isFetchingNextPage}
                onClick={() => void query.fetchNextPage()}
                data-conversation-details-more
                className="rounded-chip px-4 font-semibold disabled:opacity-50"
                style={{ minHeight: 44, color: 'var(--accent)' }}
              >
                {translate(language, 'conversation.details.members.more')}
              </button>
            </div>
          ) : null}
        </section>
      </div>
    </Sheet>
  );
}

function MembersBody({
  members,
  pending,
  failed,
  onRetry,
  viewerId,
  accent,
  storyRingOf,
}: {
  readonly members: readonly ConversationMember[];
  readonly pending: boolean;
  readonly failed: boolean;
  readonly onRetry: () => void;
  readonly viewerId: string;
  readonly accent: string;
  readonly storyRingOf?: StoryRingOf;
}) {
  const language = currentInterfaceLanguage();

  if (members.length === 0 && pending) {
    return (
      <ul aria-busy data-conversation-details-loading>
        <li className="offscreen">{translate(language, 'conversation.details.members.loading')}</li>
        {[0, 1, 2].map((index) => (
          <li key={index} aria-hidden className="flex items-center gap-3 px-4" style={{ minHeight: ROW_MIN_HEIGHT }}>
            <span className="shrink-0 rounded-chip" style={{ width: MEMBER_AVATAR, height: MEMBER_AVATAR, backgroundColor: 'var(--color-ios-card)' }} />
            <span className="rounded-field" style={{ width: '45%', height: 14, backgroundColor: 'var(--color-ios-card)' }} />
          </li>
        ))}
      </ul>
    );
  }

  const retry = failed ? (
    <div className="flex flex-col items-center gap-2 px-4 py-4 text-center" role="alert" data-conversation-details-error>
      <p className="text-body" style={{ color: 'var(--color-ios-ink-2)' }}>
        {translate(language, 'conversation.details.members.error')}
      </p>
      <button type="button" onClick={onRetry} className="rounded-chip px-4 font-semibold" style={{ minHeight: 44, color: 'var(--accent)' }}>
        {translate(language, 'conversation.details.members.retry')}
      </button>
    </div>
  ) : null;

  if (members.length === 0) {
    return (
      retry ?? (
        <p className="px-4 py-4 text-center text-body" style={{ color: 'var(--color-ios-ink-2)' }} data-conversation-details-empty>
          {translate(language, 'conversation.details.members.empty')}
        </p>
      )
    );
  }

  return (
    <>
      <ul data-conversation-details-members>
        {members.map((member) => (
          <MemberRow
            key={member.id}
            member={member}
            self={member.userId !== null && member.userId === viewerId}
            accent={accent}
            {...(storyRingOf === undefined ? {} : { storyRingOf })}
          />
        ))}
      </ul>
      {retry}
    </>
  );
}

/**
 * UNE RANGÉE DE MEMBRE — le toucher ouvre le PROFIL (la rangée entière est le
 * lien, comme la rangée d'un membre sur iOS), l'appui long ouvre le MÊME menu
 * que l'avatar d'un auteur dans le fil (#7828), sans l'entrée « Détails » :
 * on y est déjà. Un membre sans pseudo (anonyme) n'est pas un lien.
 *
 * L'avatar n'est pas lui-même un lien (un lien dans un lien est invalide) :
 * la story d'un membre s'ouvre par le menu.
 */
function MemberRow({
  member,
  self,
  accent,
  storyRingOf,
}: {
  readonly member: ConversationMember;
  readonly self: boolean;
  readonly accent: string;
  readonly storyRingOf?: StoryRingOf;
}) {
  const language = currentInterfaceLanguage();
  const roleKey = ROLE_KEYS[member.role.toLowerCase()];
  const ring = storyRingOf?.(member.userId ?? undefined);
  const entries = avatarMenuEntries({ username: member.username, storyRing: ring, details: false });

  const contenu = (
    <>
      <Avatar initials={initialsOf(member.displayName)} color={accent} size={MEMBER_AVATAR} {...(member.avatar === undefined ? {} : { src: member.avatar })} />
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-body font-medium" style={{ color: 'var(--color-ios-ink)' }}>
          {member.displayName}
          {self ? <span style={{ color: 'var(--color-ios-ink-2)' }}> · {translate(language, 'conversation.details.members.you')}</span> : null}
        </span>
        {member.username === null ? null : (
          <span className="truncate text-caption" style={{ color: 'var(--color-ios-ink-2)' }}>
            @{member.username}
          </span>
        )}
      </span>
      {roleKey === undefined ? null : (
        <span className="shrink-0 text-caption font-semibold" style={{ color: 'var(--color-ios-ink-2)' }} data-member-role={member.role}>
          {translate(language, roleKey)}
        </span>
      )}
    </>
  );

  const rowClass = 'flex items-center gap-3 px-4 py-2';
  const rowStyle = { minHeight: ROW_MIN_HEIGHT };

  return (
    <li data-conversation-member={member.id}>
      {member.username === null ? (
        <div className={rowClass} style={rowStyle}>
          {contenu}
        </div>
      ) : (
        <AvatarMenuTrigger entries={entries} name={member.displayName}>
          <Link
            to="userProfile"
            params={{ username: member.username }}
            onClick={peekProfileOnClick(member.username)}
            className={rowClass}
            style={rowStyle}
          >
            {contenu}
          </Link>
        </AvatarMenuTrigger>
      )}
    </li>
  );
}
