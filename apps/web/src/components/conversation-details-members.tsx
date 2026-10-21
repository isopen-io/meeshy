import { useQueryClient } from '@tanstack/react-query';
import { lazy, Suspense, useEffect, useId, useMemo, useRef, useState } from 'react';

import { performMemberAction } from '@/lib/api/conversation-member-actions';
import type { ConversationMember } from '@/lib/api/conversation-members';
import type { ConversationsDeps } from '@/lib/api/conversations';
import type { Conversation } from '@/lib/api/types';
import { manageText, type ConversationManageCatalogKey } from '@/lib/i18n-conversation-manage-catalog';
import { translate } from '@/lib/i18n-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';
import { avatarMenuEntries } from '@/lib/view/avatar-menu';
import { managementOf, memberActionsFor, type MemberAction, type MemberActionKind } from '@/lib/view/conversation-management';
import { peekProfileOnClick } from '@/lib/view/profile-peek';
import type { StoryRingOf } from '@/lib/view/use-author-story-rings';
import { Link } from '@/routes/route-table';

import { AvatarMenuTrigger } from './avatar-menu';
import { MemberAvatar } from './member-avatar';
import { ConfirmDialog } from './confirm-dialog';
import { Glyph } from './glyph';
import { Sheet } from './sheet';

/**
 * **LES MEMBRES D'UNE CONVERSATION, ET LEUR GESTION** (#7829, #10613) — la
 * liste de la feuille de détails (profil au toucher, menu d'auteur à l'appui
 * long), et pour qui en a le rang, les gestes de `ConversationSettingsView`
 * sur iOS : promouvoir, rétrograder, expulser, bannir, ajouter. La loi de ce
 * qui se montre est `managementOf` / `memberActionsFor`
 * (`lib/view/conversation-management.ts`) ; chaque geste est optimiste et se
 * défait sur refus (`lib/api/conversation-member-actions.ts`).
 *
 * L'ajout se charge au geste (`conversation-add-members-sheet.tsx`) : il
 * emporte l'annuaire et la recherche de personnes, que la lecture de la feuille
 * n'a pas à télécharger.
 */
const AddMembersSheet = lazy(() => import('./conversation-add-members-sheet').then((m) => ({ default: m.AddMembersSheet })));

type RoleKey = 'conversation.details.role.creator' | 'conversation.details.role.admin' | 'conversation.details.role.moderator';

const ROLE_KEYS: Readonly<Record<string, RoleKey>> = {
  creator: 'conversation.details.role.creator',
  admin: 'conversation.details.role.admin',
  moderator: 'conversation.details.role.moderator',
};

const ACTION_KEYS: Readonly<Record<MemberActionKind, ConversationManageCatalogKey>> = {
  'promote-admin': 'conversationManage.action.promote_admin',
  'promote-moderator': 'conversationManage.action.promote_moderator',
  'demote-member': 'conversationManage.action.demote_member',
  expel: 'conversationManage.action.expel',
  ban: 'conversationManage.action.ban',
};

const DONE_KEYS: Readonly<Record<MemberActionKind, ConversationManageCatalogKey>> = {
  'promote-admin': 'conversationManage.done.role',
  'promote-moderator': 'conversationManage.done.role',
  'demote-member': 'conversationManage.done.role',
  expel: 'conversationManage.done.expel',
  ban: 'conversationManage.done.ban',
};

const DESTRUCTIVE: ReadonlySet<MemberActionKind> = new Set(['expel', 'ban']);

const MEMBER_AVATAR = 40;
const ROW_MIN_HEIGHT = 56;
const PENDING_PREFIX = 'pending-';

const fold = (text: string): string => text.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLocaleLowerCase();

const matchesQuery = (member: ConversationMember, needle: string): boolean =>
  needle === '' || [member.displayName, member.username ?? ''].some((text) => fold(text).includes(needle));

type Pending = { readonly member: ConversationMember; readonly action: MemberAction };

export function ConversationMembersSection({
  conversation,
  members,
  pending,
  failed,
  onRetry,
  hasMore,
  loadingMore,
  onMore,
  viewerId,
  accent,
  storyRingOf,
  deps,
  language,
  manageReady,
  focus,
}: {
  readonly conversation: Conversation;
  readonly members: readonly ConversationMember[];
  readonly pending: boolean;
  readonly failed: boolean;
  readonly onRetry: () => void;
  readonly hasMore: boolean;
  readonly loadingMore: boolean;
  readonly onMore: () => void;
  readonly viewerId: string;
  readonly accent: string;
  readonly storyRingOf?: StoryRingOf | undefined;
  readonly deps: ConversationsDeps;
  readonly language: InterfaceLanguage;
  /** Le catalogue de gestion est chargé : les contrôles de gestion peuvent dire leurs mots. */
  readonly manageReady: boolean;
  /** La fiche ouverte pour « Inviter » ouvre l'ajout ; pour « Gérer les membres », amène la section en vue (revue #11211). */
  readonly focus?: 'invite' | 'members' | undefined;
}) {
  const headingId = useId();
  const queryClient = useQueryClient();
  const [query, setQuery] = useState('');
  const [acting, setActing] = useState<ConversationMember | null>(null);
  const [confirming, setConfirming] = useState<Pending | null>(null);
  const [adding, setAdding] = useState(focus === 'invite');
  const sectionRef = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (focus !== undefined) sectionRef.current?.scrollIntoView?.({ block: 'start' });
  }, [focus]);
  const [status, setStatus] = useState('');
  const manage = managementOf(conversation);
  const t = (key: ConversationManageCatalogKey, params?: Readonly<Record<string, string>>) => manageText(language, key, params);

  const needle = fold(query.trim());
  const shown = useMemo(() => members.filter((member) => matchesQuery(member, needle)), [members, needle]);
  const actionsOf = (member: ConversationMember): readonly MemberAction[] =>
    !manageReady || member.id.startsWith(PENDING_PREFIX)
      ? []
      : memberActionsFor({ member, viewerRole: conversation.currentUserRole, viewerId, conversationType: conversation.type });

  const run = async ({ member, action }: Pending) => {
    setActing(null);
    setConfirming(null);
    const outcome = await performMemberAction({ deps: { ...deps, queryClient }, conversationId: conversation.id, member, action });
    setStatus(
      outcome.ok
        ? t(DONE_KEYS[action.kind])
        : t(outcome.reason === 'refused' ? 'conversationManage.error.refused' : 'conversationManage.error.failed'),
    );
  };

  const choose = (member: ConversationMember, action: MemberAction) => {
    if (DESTRUCTIVE.has(action.kind)) {
      setActing(null);
      setConfirming({ member, action });
      return;
    }
    void run({ member, action });
  };

  return (
    <section ref={sectionRef} aria-labelledby={headingId} className="pb-6" data-conversation-details-members-section>
      <div className="flex items-center justify-between gap-2 px-4 pb-2">
        <h4 id={headingId} className="text-caption font-semibold uppercase" style={{ color: 'var(--color-ios-ink-2)' }}>
          {translate(language, 'conversation.details.members.section')}
        </h4>
        {manage.addMembers && manageReady ? (
          <button
            type="button"
            onClick={() => setAdding(true)}
            data-conversation-members-add
            className="flex items-center gap-1.5 rounded-chip px-3 font-semibold focus-visible:outline-2 focus-visible:outline-offset-2"
            style={{ minHeight: 44, color: 'var(--accent)', outlineColor: 'var(--accent)' }}
          >
            <Glyph name="plus" size={18} />
            {t('conversationManage.add.open')}
          </button>
        ) : null}
      </div>

      {manageReady && members.length > 0 ? (
        <div className="px-4 pb-2">
          <label className="flex items-center gap-2 rounded-field px-3" style={{ minHeight: 44, backgroundColor: 'var(--color-ios-card)' }}>
            <Glyph name="magnifyingGlass" size={16} style={{ color: 'var(--color-ios-ink-2)' }} />
            <span className="offscreen">{t('conversationManage.members.search')}</span>
            <input
              type="search"
              value={query}
              onInput={(event) => setQuery(event.currentTarget.value)}
              placeholder={t('conversationManage.members.search')}
              data-conversation-members-search
              className="min-w-0 flex-1 bg-transparent text-body outline-none"
              style={{ color: 'var(--color-ios-ink)' }}
            />
          </label>
        </div>
      ) : null}

      <MembersBody
        members={shown}
        filtered={needle !== ''}
        pending={pending}
        failed={failed}
        onRetry={onRetry}
        viewerId={viewerId}
        conversationId={conversation.id}
        accent={accent}
        language={language}
        actionsOf={actionsOf}
        onManage={setActing}
        {...(manageReady ? { noResults: t('conversationManage.members.no_results'), manageLabel: (name: string) => t('conversationManage.members.manage', { name }) } : {})}
        {...(storyRingOf === undefined ? {} : { storyRingOf })}
      />

      {hasMore ? (
        <div className="flex justify-center px-4 pt-2">
          <button
            type="button"
            disabled={loadingMore}
            onClick={onMore}
            data-conversation-details-more
            className="rounded-chip px-4 font-semibold disabled:opacity-50"
            style={{ minHeight: 44, color: 'var(--accent)' }}
          >
            {translate(language, 'conversation.details.members.more')}
          </button>
        </div>
      ) : null}

      <p role="status" aria-live="polite" className="px-4 pt-2 text-center text-caption" style={{ color: 'var(--color-ios-ink-2)' }} data-conversation-members-status>
        {status}
      </p>

      {acting === null ? null : (
        <Sheet title={t('conversationManage.members.manage', { name: acting.displayName })} presentation="bottom" onClose={() => setActing(null)} dialogData={{ 'data-member-actions': acting.id }}>
          {actionsOf(acting).map((action) => (
            <li key={action.kind}>
              <button
                type="button"
                onClick={() => choose(acting, action)}
                data-member-action={action.kind}
                className="flex w-full items-center px-4 text-start text-body font-semibold focus-visible:outline-2 focus-visible:-outline-offset-2"
                style={{ minHeight: 52, color: DESTRUCTIVE.has(action.kind) ? 'var(--color-error)' : 'var(--color-ios-ink)', outlineColor: 'var(--accent)' }}
              >
                {t(ACTION_KEYS[action.kind])}
              </button>
            </li>
          ))}
        </Sheet>
      )}

      {confirming === null ? null : (
        <ConfirmDialog
          name={`member-${confirming.action.kind}`}
          title={t(confirming.action.kind === 'ban' ? 'conversationManage.confirm.ban.title' : 'conversationManage.confirm.expel.title', { name: confirming.member.displayName })}
          body={t(confirming.action.kind === 'ban' ? 'conversationManage.confirm.ban.body' : 'conversationManage.confirm.expel.body', { name: confirming.member.displayName })}
          cancelLabel={t('conversationManage.cancel')}
          confirmLabel={t(ACTION_KEYS[confirming.action.kind])}
          tone="destructive"
          onConfirm={() => void run(confirming)}
          onCancel={() => setConfirming(null)}
        />
      )}

      {adding && manageReady ? (
        <Suspense fallback={null}>
          <AddMembersSheet
            conversationId={conversation.id}
            members={members}
            viewerId={viewerId}
            accent={accent}
            deps={deps}
            language={language}
            onClose={() => setAdding(false)}
            onDone={setStatus}
          />
        </Suspense>
      ) : null}
    </section>
  );
}

function MembersBody({
  members,
  filtered,
  pending,
  failed,
  onRetry,
  viewerId,
  conversationId,
  accent,
  language,
  storyRingOf,
  actionsOf,
  onManage,
  noResults,
  manageLabel,
}: {
  readonly members: readonly ConversationMember[];
  readonly filtered: boolean;
  readonly pending: boolean;
  readonly failed: boolean;
  readonly onRetry: () => void;
  readonly viewerId: string;
  readonly conversationId: string;
  readonly accent: string;
  readonly language: InterfaceLanguage;
  readonly storyRingOf?: StoryRingOf;
  readonly actionsOf: (member: ConversationMember) => readonly MemberAction[];
  readonly onManage: (member: ConversationMember) => void;
  readonly noResults?: string;
  readonly manageLabel?: (name: string) => string;
}) {
  if (members.length === 0 && pending && !filtered) {
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
          {filtered && noResults !== undefined ? noResults : translate(language, 'conversation.details.members.empty')}
        </p>
      )
    );
  }

  return (
    <>
      <ul data-conversation-details-members>
        {members.map((member) => {
          const actions = actionsOf(member);
          return (
            <MemberRow
              key={member.id}
              member={member}
              self={member.userId !== null && member.userId === viewerId}
              conversationId={conversationId}
              accent={accent}
              language={language}
              {...(actions.length > 0 && manageLabel !== undefined ? { onManage: () => onManage(member), manageLabel: manageLabel(member.displayName) } : {})}
              {...(storyRingOf === undefined ? {} : { storyRingOf })}
            />
          );
        })}
      </ul>
      {retry}
    </>
  );
}

/**
 * UNE RANGÉE DE MEMBRE — le toucher ouvre le PROFIL (la rangée entière est le
 * lien, comme la rangée d'un membre sur iOS), l'appui long ouvre le MÊME menu
 * que l'avatar d'un auteur dans le fil (#7828), sans l'entrée « Détails » :
 * on y est déjà. Un membre sans pseudo (anonyme) n'est pas un lien. Pour qui
 * a un geste sur ce membre, un bouton « … » À CÔTÉ du lien (jamais dedans :
 * un bouton dans un lien est invalide) ouvre ces gestes — l'`ellipsis` d'iOS.
 */
function MemberRow({
  member,
  self,
  conversationId,
  accent,
  language,
  storyRingOf,
  onManage,
  manageLabel,
}: {
  readonly member: ConversationMember;
  readonly self: boolean;
  readonly conversationId: string;
  readonly accent: string;
  readonly language: InterfaceLanguage;
  readonly storyRingOf?: StoryRingOf;
  readonly onManage?: () => void;
  readonly manageLabel?: string;
}) {
  const roleKey = ROLE_KEYS[member.role.toLowerCase()];
  const ring = storyRingOf?.(member.userId ?? undefined);
  const entries = avatarMenuEntries({ username: member.username, storyRing: ring, details: false });

  const contenu = (
    <>
      <MemberAvatar member={member} accent={accent} size={MEMBER_AVATAR} conversationId={conversationId} />
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
    <li data-conversation-member={member.id} className="flex items-center">
      <div className="min-w-0 flex-1">
        {member.username === null ? (
          <div className={rowClass} style={rowStyle}>
            {contenu}
          </div>
        ) : (
          <AvatarMenuTrigger entries={entries} name={member.displayName}>
            <Link to="userProfile" params={{ username: member.username }} onClick={peekProfileOnClick(member.username)} className={rowClass} style={rowStyle}>
              {contenu}
            </Link>
          </AvatarMenuTrigger>
        )}
      </div>
      {onManage === undefined ? null : (
        <button
          type="button"
          onClick={onManage}
          aria-label={manageLabel}
          aria-haspopup="dialog"
          data-member-manage={member.id}
          className="me-2 grid shrink-0 place-items-center rounded-chip focus-visible:outline-2 focus-visible:outline-offset-2"
          style={{ width: 44, height: 44, color: 'var(--color-ios-ink-2)', outlineColor: 'var(--accent)' }}
        >
          <Glyph name="dotsThreeVertical" size={20} />
        </button>
      )}
    </li>
  );
}
