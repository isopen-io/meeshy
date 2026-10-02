import { useState, type ReactNode } from 'react';

import { AdminBadge, AdminInterpretedBadge } from '@/components/admin/badges';
import { AdminConfirmSheet } from '@/components/admin/confirm-sheet';
import { AdminEntityIdentity } from '@/components/admin/entity-chip';
import { AdminEntityList, type AdminColumn } from '@/components/admin/entity-list';
import { AdminListToolbar } from '@/components/admin/list-toolbar';
import { AdminMomentText, AdminNotProvided } from '@/components/admin/meta';
import type { AdminTarget } from '@/lib/admin/admin-routes';
import { NARROW_LIST_FRAME, useLocalAdminList, type LocalListState } from '@/lib/admin/conversation-paged-list';
import { memberGestures, memberRefOf, participantName, type MemberGestures } from '@/lib/admin/conversation-model';
import { interpretParticipantRole, interpretPresence } from '@/lib/admin/interpret/enums';
import { formatCount } from '@/lib/admin/interpret/numbers';
import { adminMomentOf } from '@/lib/admin/interpret/time';
import { translatedRefusal, useAdminAction } from '@/lib/admin/use-admin-action';
import type { AdminDeps } from '@/lib/api/admin';
import type { AdminPage } from '@/lib/api/admin-page';
import {
  ADMIN_CONVERSATION_MEMBERS_PAGE_SIZES,
  adminConversationFicheKey,
  adminConversationMembersKey,
  loadAdminConversationMembers,
  type AdminConversationMember,
} from '@/lib/api/admin-conversation-fiche';
import {
  MOTIF_LONGUEUR_MINIMALE,
  removeAdminConversationMember,
  setAdminConversationMemberRole,
  type AdminParticipantRole,
} from '@/lib/api/admin-conversation-settings';
import { ADMIN_CONVERSATIONS_ROOT_KEY } from '@/lib/api/admin-conversations';
import type { ApiResult } from '@/lib/api/http';
import { translateAdmin, type AdminLanguage } from '@/lib/i18n-admin-catalog';
import type { AnnouncementTone } from '@/lib/view/use-live-announcer';

/**
 * **LES MEMBRES D'UNE CONVERSATION** (#8876) — tous les participants, NOMMÉS
 * (nom courant, @pseudo, présence), leur rôle en mots, leur arrivée, et les deux
 * gestes souverains que la passerelle sert : changer un rôle, retirer un membre
 * (`PATCH …/participants/:userId`, `POST …/participants/:userId/remove`).
 *
 * ## Un geste n'existe que s'il a un effet
 *
 * `memberGestures` décide, par membre : le créateur est protégé (l'écran le DIT,
 * il ne grise pas deux contrôles en silence), un invité anonyme ou un robot n'a
 * pas de compte donc aucun geste, un membre parti n'a plus rien à régler, un
 * direct n'a pas de hiérarchie, la conversation globale ne se vide pas.
 *
 * ## Chaque geste se CONFIRME, avec son motif
 *
 * Le rôle se choisit dans la rangée, puis `AdminConfirmSheet` dit ce qui va se
 * passer (qui, de quel rôle à quel rôle) et demande le motif écrit que la
 * passerelle exige (dix caractères, consigné). L'effet est optimiste sur la page
 * affichée — défait si la passerelle refuse —, puis la fiche, la page et
 * l'inventaire sont relus : la vérité vient du serveur.
 *
 * ## Le créateur, même si la passerelle le refuse
 *
 * Un 403 `CREATOR_PROTECTED` (le rang a changé entre deux lectures) se dit par
 * sa phrase propre, jamais par un « permission refusée » qui ferait chercher un
 * droit manquant là où c'est une protection.
 */
type Pending =
  | { readonly kind: 'role'; readonly member: AdminConversationMember; readonly role: AdminParticipantRole }
  | { readonly kind: 'remove'; readonly member: AdminConversationMember };

const ROLES: readonly AdminParticipantRole[] = ['admin', 'moderator', 'member'];

const FOCUS = 'focus-visible:outline-2 focus-visible:outline-offset-2';

/** Un badge ou un instant se lit d'un trait : la largeur se prend sur les colonnes qui peuvent céder. */
const Unbroken = ({ children }: { readonly children: ReactNode }) => <span className="whitespace-nowrap">{children}</span>;
const CONTROL = {
  minHeight: 44,
  backgroundColor: 'var(--color-ios-surface)',
  border: '1px solid var(--color-edge)',
  color: 'var(--color-ios-ink)',
  outlineColor: 'var(--color-ios-brand)',
} as const;

/** Un compte ouvre sa fiche membre, un invité sa fiche d'anonyme (par sa ligne de participation) ; un robot n'en a pas. */
const memberTarget = (member: AdminConversationMember): AdminTarget | null => {
  if (member.kind === 'anonymous') return { kind: 'entity', entity: 'anonymous', id: member.id };
  return member.userId === null ? null : { kind: 'entity', entity: 'user', id: member.userId };
};

const isRole = (value: string): value is AdminParticipantRole => ROLES.some((role) => role === value);

/** Les lignes de la page en cache — elles sont décodées par construction de la clé (`adminConversationMembersKey`). */
function isMembersPage(value: unknown): value is AdminPage<AdminConversationMember> {
  return typeof value === 'object' && value !== null && 'rows' in value && Array.isArray(value.rows);
}

const patchedRows =
  (memberId: string, patch: (member: AdminConversationMember) => AdminConversationMember) =>
  (before: unknown): unknown =>
    isMembersPage(before) ? { ...before, rows: before.rows.map((row) => (row.id === memberId ? patch(row) : row)) } : before;

type MemberActionsProps = {
  readonly language: AdminLanguage;
  readonly member: AdminConversationMember;
  readonly gestures: MemberGestures;
  readonly online: boolean;
  /** Le rôle CHOISI en attente de confirmation : le choix reste lisible tant que la feuille est ouverte. */
  readonly chosenRole: AdminParticipantRole | null;
  readonly onRole: (role: AdminParticipantRole) => void;
  readonly onRemove: () => void;
};

function MemberActions({ language, member, gestures, online, chosenRole, onRole, onRemove }: MemberActionsProps) {
  const name = participantName(member, language);

  if (gestures.creatorProtected) {
    return (
      <span data-admin-member-protected className="text-caption" style={{ color: 'var(--color-ios-ink-2)' }}>
        {translateAdmin(language, 'admin.conversation.members.creatorProtected')}
      </span>
    );
  }
  if (!gestures.canChangeRole && !gestures.canRemove) return <AdminNotProvided language={language} />;

  return (
    <span className="flex flex-wrap items-center gap-2">
      {gestures.canChangeRole ? (
        <select
          data-admin-action="member-role"
          aria-label={translateAdmin(language, 'admin.conversation.members.roleOf', { name })}
          disabled={!online}
          value={chosenRole ?? member.role}
          onChange={(event) => {
            const role = event.target.value;
            if (isRole(role) && role !== member.role) onRole(role);
          }}
          className={`rounded-chip px-3 text-body ${FOCUS}`}
          style={CONTROL}
        >
          {isRole(member.role) ? null : <option value={member.role}>{interpretParticipantRole(member.role, language).label}</option>}
          {ROLES.map((role) => (
            <option key={role} value={role}>
              {interpretParticipantRole(role, language).label}
            </option>
          ))}
        </select>
      ) : null}
      {gestures.canRemove ? (
        <button
          type="button"
          data-admin-action="member-remove"
          aria-label={translateAdmin(language, 'admin.conversation.members.removeOf', { name })}
          disabled={!online}
          onClick={onRemove}
          className={`rounded-chip px-4 text-body font-semibold disabled:opacity-40 ${FOCUS}`}
          style={{ ...CONTROL, color: 'var(--color-danger)' }}
        >
          {translateAdmin(language, 'admin.conversation.members.remove')}
        </button>
      ) : null}
    </span>
  );
}

export function ConversationMembers({
  language,
  conversationId,
  conversationType,
  deps,
  online,
  now,
  announce,
}: {
  readonly language: AdminLanguage;
  readonly conversationId: string;
  readonly conversationType: string;
  readonly deps: AdminDeps;
  readonly online: boolean;
  readonly now: Date;
  readonly announce: (message: string, tone?: AnnouncementTone) => void;
}) {
  const list = useLocalAdminList<AdminConversationMember, never>({
    queryKey: (state: LocalListState<never>) => adminConversationMembersKey(conversationId, state.offset, state.limit),
    load: (state, signal) => loadAdminConversationMembers({ ...deps, conversationId, offset: state.offset, limit: state.limit, signal }),
    pageSizes: ADMIN_CONVERSATION_MEMBERS_PAGE_SIZES,
  });
  const action = useAdminAction<unknown>({ language, onAnnounce: announce });
  const [pending, setPending] = useState<Pending | null>(null);
  const [settling, setSettling] = useState(false);
  const busy = action.state.phase === 'running' || settling;

  const pageKey = adminConversationMembersKey(conversationId, list.state.offset, list.state.limit);
  const invalidate = [adminConversationFicheKey(conversationId), ADMIN_CONVERSATIONS_ROOT_KEY] as const;

  /** Un 403 `CREATOR_PROTECTED` se dit par sa phrase : un refus traduit, que `useAdminAction` affiche tel quel. */
  const creatorGuarded = async <T,>(call: Promise<ApiResult<T>>): Promise<ApiResult<T>> => {
    const outcome = await call;
    return !outcome.ok && outcome.code === 'CREATOR_PROTECTED'
      ? translatedRefusal(translateAdmin(language, 'admin.conversation.members.creatorRefused'))
      : outcome;
  };

  const perform = async (gesture: Parameters<typeof action.run>[0]) => {
    setSettling(true);
    try {
      return await action.run(gesture);
    } finally {
      setSettling(false);
    }
  };

  const confirm = async (motive: string | null) => {
    if (pending === null || motive === null) return;
    const { member } = pending;
    const userId = member.userId;
    if (userId === null) return;
    const done =
      pending.kind === 'role'
        ? await perform({
            call: () => creatorGuarded(setAdminConversationMemberRole({ ...deps, conversationId, userId, role: pending.role, reason: motive })),
            success: 'admin.conversation.members.role.done',
            optimistic: { key: pageKey, apply: patchedRows(member.id, (row) => ({ ...row, role: pending.role })) },
            invalidate,
          })
        : await perform({
            call: () => creatorGuarded(removeAdminConversationMember({ ...deps, conversationId, userId, reason: motive })),
            success: 'admin.conversation.members.remove.done',
            optimistic: { key: pageKey, apply: patchedRows(member.id, (row) => ({ ...row, isActive: false, isOnline: false })) },
            invalidate,
          });
    if (done !== null) setPending(null);
  };

  const close = () => {
    action.reset();
    setPending(null);
  };

  const open = (next: Pending) => {
    action.reset();
    setPending(next);
  };

  const moment = (iso: string | null) => (
    <Unbroken>
      <AdminMomentText moment={adminMomentOf(iso, now, language)} />
    </Unbroken>
  );
  const error = action.state.phase === 'error' ? action.state.message : null;

  const columns: readonly AdminColumn<AdminConversationMember>[] = [
    {
      id: 'member',
      header: translateAdmin(language, 'admin.conversation.members.col.member'),
      primary: true,
      cell: (row) => <AdminEntityIdentity language={language} entity={memberRefOf(row, language)} />,
    },
    {
      id: 'role',
      header: translateAdmin(language, 'admin.conversation.members.col.role'),
      cell: (row) => (
        <Unbroken>
          <AdminInterpretedBadge value={interpretParticipantRole(row.role, language)} />
        </Unbroken>
      ),
    },
    {
      id: 'presence',
      header: translateAdmin(language, 'admin.conversation.members.col.presence'),
      priority: 3,
      cell: (row) =>
        row.isActive ? (
          <Unbroken>
            <AdminInterpretedBadge value={interpretPresence(row.isOnline ? 'online' : 'offline', language)} />
          </Unbroken>
        ) : (
          <AdminNotProvided language={language} />
        ),
    },
    {
      id: 'state',
      header: translateAdmin(language, 'admin.conversation.members.col.state'),
      cell: (row) => (
        <Unbroken>
          <AdminBadge tone={row.isActive ? 'success' : 'neutral'} glyph={row.isActive ? 'checkCircle' : 'userMinus'}>
            {translateAdmin(language, row.isActive ? 'admin.conversation.members.state.active' : 'admin.conversation.members.state.left')}
          </AdminBadge>
        </Unbroken>
      ),
    },
    { id: 'joined', header: translateAdmin(language, 'admin.conversation.members.col.joined'), priority: 3, cell: (row) => moment(row.joinedAt) },
    {
      id: 'actions',
      header: translateAdmin(language, 'admin.conversation.members.col.actions'),
      cell: (row) => (
        <MemberActions
          language={language}
          member={row}
          gestures={memberGestures(row, conversationType)}
          online={online}
          chosenRole={pending?.kind === 'role' && pending.member.id === row.id ? pending.role : null}
          onRole={(role) => open({ kind: 'role', member: row, role })}
          onRemove={() => open({ kind: 'remove', member: row })}
        />
      ),
    },
  ];

  const total = list.query.data?.total;
  const motive = { label: translateAdmin(language, 'admin.conversation.members.motive'), minLength: MOTIF_LONGUEUR_MINIMALE, required: true } as const;

  const sheet = () => {
    if (pending === null) return null;
    const name = participantName(pending.member, language);
    if (pending.kind === 'role') {
      return (
        <AdminConfirmSheet
          language={language}
          title={translateAdmin(language, 'admin.conversation.members.role.confirmTitle')}
          body={translateAdmin(language, 'admin.conversation.members.role.confirmBody', {
            name,
            from: interpretParticipantRole(pending.member.role, language).label,
            to: interpretParticipantRole(pending.role, language).label,
          })}
          confirmLabel={translateAdmin(language, 'admin.conversation.members.role.confirm')}
          tone="primary"
          motive={motive}
          busy={busy}
          error={error}
          onConfirm={(text) => void confirm(text)}
          onCancel={close}
        />
      );
    }
    return (
      <AdminConfirmSheet
        language={language}
        title={translateAdmin(language, 'admin.conversation.members.remove.confirmTitle')}
        body={translateAdmin(language, 'admin.conversation.members.remove.confirmBody', { name })}
        confirmLabel={translateAdmin(language, 'admin.conversation.members.remove.confirm')}
        tone="danger"
        motive={motive}
        busy={busy}
        error={error}
        onConfirm={(text) => void confirm(text)}
        onCancel={close}
      />
    );
  };

  return (
    <>
      <div className={NARROW_LIST_FRAME}>
        <AdminEntityList
          language={language}
          section="conversations"
          list={list}
          columns={columns}
          rowKey={(row) => row.id}
          rowTarget={memberTarget}
          caption={translateAdmin(language, 'admin.conversation.members.caption')}
          toolbar={
            total === undefined ? undefined : (
              <AdminListToolbar language={language} trailing={translateAdmin(language, 'admin.conversation.members.count', { count: formatCount(total, language) })} />
            )
          }
          empty={{ title: translateAdmin(language, 'admin.conversation.members.empty') }}
          filteredEmpty={{ title: translateAdmin(language, 'admin.conversation.members.empty') }}
          pageSizes={ADMIN_CONVERSATION_MEMBERS_PAGE_SIZES}
        />
      </div>
      {sheet()}
    </>
  );
}
