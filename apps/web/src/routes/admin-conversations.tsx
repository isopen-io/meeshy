import type { ReactNode } from 'react';

import { Avatar } from '@/components/avatar';
import { AdminEntityList, type AdminColumn } from '@/components/admin/entity-list';
import { AdminEntityChip, AdminEntityIdentity } from '@/components/admin/entity-chip';
import { AdminInterpretedBadge } from '@/components/admin/badges';
import { AdminListToolbar, type AdminToolbarFilter } from '@/components/admin/list-toolbar';
import { AdminMomentText } from '@/components/admin/meta';
import { AdminPageHeader } from '@/components/admin/page-header';
import { AdminSectionScreen } from '@/components/admin/section-screen';
import { AdminInlineNotice, AdminOfflineNotice } from '@/components/admin/states';
import {
  CONVERSATION_LIST_SPEC,
  CONVERSATION_TYPES,
  conversationListQuery,
  type ConversationFilterKey,
  type ConversationIdFilterKey,
  type ConversationSortKey,
} from '@/lib/admin/conversation-list';
import { conversationRefOf, conversationStateOf, participantName } from '@/lib/admin/conversation-model';
import { interpretConversationType } from '@/lib/admin/interpret/enums';
import { personInitials } from '@/lib/admin/interpret/labels';
import { formatCount } from '@/lib/admin/interpret/numbers';
import { adminMomentOf } from '@/lib/admin/interpret/time';
import { ADMIN_PERIODS } from '@/lib/admin/period';
import { useAdminList } from '@/lib/admin/use-admin-list';
import type { AdminDeps } from '@/lib/api/admin';
import {
  adminConversationsQueryKey,
  loadAdminConversationList,
  type AdminInstanceConversation,
  type AdminInstanceParticipant,
} from '@/lib/api/admin-conversations';
import { apiDeps } from '@/lib/api/deps';
import { currentAdminLanguage, suspendForAdminInterfaceCatalog, translateAdmin, type AdminLanguage } from '@/lib/i18n-admin-catalog';
import { participantAvatarOf } from '@/lib/view/conversation';
import type { AdminOption } from '@/routes/admin-table';

/**
 * **L'INVENTAIRE DES CONVERSATIONS** (#6862, #7873, #8876) — `/admin/conversations`.
 *
 * Ce que la plateforme porte, nommé : chaque conversation par son titre ou, à
 * défaut, par ceux qui la composent (« Awa et Jean », « Awa, Jean et 3 autres ») —
 * jamais par un identifiant —, son type et son état en mots, sa communauté, son
 * effectif, ses dates. La ligne ouvre la fiche, où l'on comprend la conversation
 * et où l'on agit.
 *
 * ## Ce que cet écran NE montre pas
 *
 * Aucun contenu de message, aucun aperçu : `GET /admin/conversations` sert des
 * métadonnées, et un titre n'est pas un message. Le contenu se lit depuis la
 * fiche, sous motif écrit et trace.
 *
 * ## La garde est LUE, pas héritée
 *
 * `AdminSectionScreen` ouvre l'écran sur la capacité SERVIE (`canManageConversations`)
 * ET le rang d'administration — la section est `adminRankOnly` : un MODERATOR, qui
 * porte la permission sans le rang, n'y entre pas.
 *
 * ## Rien de ce qui est lu ici ne touche le disque
 *
 * Les clés descendent d'`ADMIN_SOUVERAIN_PREFIXE` (`adminConversationsQueryKey`),
 * que le filtre de déshydratation de `query-client.ts` exclut : un inventaire de
 * qui parle à qui ne survit pas à la session.
 */
const defaultNow = (): Date => new Date();

const option = (value: string, label: string): AdminOption => ({ value, label });

const STACK_SIZE = 6;

/** Un badge ou un instant se lit d'un trait : la largeur se prend sur les colonnes qui peuvent céder, pas en coupant « Fermée à l'écriture » sur trois lignes. */
const Unbroken = ({ children }: { readonly children: ReactNode }) => <span className="whitespace-nowrap">{children}</span>;

/** La pile des premiers membres : décorative, le nombre exact se lit dans la colonne « Membres ». */
function MemberStack({ language, participants }: { readonly language: AdminLanguage; readonly participants: readonly AdminInstanceParticipant[] }) {
  if (participants.length === 0) return null;
  const shown = participants.slice(0, STACK_SIZE);
  return (
    <span data-admin-member-stack className="flex shrink-0 -space-x-2" aria-hidden="true">
      {shown.map((participant) => {
        const name = participantName(participant, language);
        const photo = participantAvatarOf({ avatar: participant.avatar });
        return (
          <Avatar
            key={participant.id}
            initials={personInitials(name)}
            color="var(--color-ios-brand)"
            size={24}
            name={name}
            {...(photo === undefined ? {} : { src: photo })}
          />
        );
      })}
    </span>
  );
}

type ConversationsPanelProps = {
  readonly language: AdminLanguage;
  readonly deps?: AdminDeps;
  readonly now?: () => Date;
};

export function AdminConversationsPanel({ language, deps = apiDeps, now = defaultNow }: ConversationsPanelProps) {
  const list = useAdminList<AdminInstanceConversation, ConversationSortKey, ConversationFilterKey, ConversationIdFilterKey>({
    spec: CONVERSATION_LIST_SPEC,
    queryKey: adminConversationsQueryKey,
    enabled: true,
    load: (state, signal) => loadAdminConversationList({ ...deps, query: conversationListQuery(state, now()), signal }),
  });

  const all = translateAdmin(language, 'admin.list.all');
  const filter = (id: ConversationFilterKey, label: string, options: readonly AdminOption[]): AdminToolbarFilter => ({
    id,
    label,
    value: list.state.filters[id] ?? '',
    options,
    onChange: (value) => list.filter(id, value === '' ? null : value),
  });

  const filters: readonly AdminToolbarFilter[] = [
    filter('type', translateAdmin(language, 'admin.conversation.filter.type'), [
      option('', all),
      ...CONVERSATION_TYPES.map((type) => option(type, interpretConversationType(type, language).label)),
    ]),
    filter('isActive', translateAdmin(language, 'admin.conversation.filter.state'), [
      option('', all),
      option('true', translateAdmin(language, 'admin.conversation.filter.state.active')),
      option('false', translateAdmin(language, 'admin.conversation.filter.state.archived')),
    ]),
    filter('period', translateAdmin(language, 'admin.conversation.filter.period'), [
      option('', translateAdmin(language, 'admin.conversation.filter.period.all')),
      ...ADMIN_PERIODS.map((period) => option(period, translateAdmin(language, `admin.kit.period.${period}`))),
    ]),
  ];

  const moment = (iso: string | null) => (
    <Unbroken>
      <AdminMomentText moment={adminMomentOf(iso, now(), language)} />
    </Unbroken>
  );

  const columns: readonly AdminColumn<AdminInstanceConversation>[] = [
    {
      id: 'conversation',
      header: translateAdmin(language, 'admin.conversation.col.conversation'),
      primary: true,
      cell: (row) => (
        <span className="flex min-w-0 flex-1 items-center justify-between gap-3">
          <AdminEntityIdentity language={language} entity={conversationRefOf(row, language)} />
          <MemberStack language={language} participants={row.participants} />
        </span>
      ),
    },
    {
      id: 'type',
      header: translateAdmin(language, 'admin.conversation.col.type'),
      cell: (row) => (
        <Unbroken>
          <AdminInterpretedBadge value={interpretConversationType(row.type, language)} />
        </Unbroken>
      ),
    },
    {
      id: 'community',
      header: translateAdmin(language, 'admin.conversation.col.community'),
      cell: (row) =>
        row.community === null ? (
          <span aria-label="—">—</span>
        ) : (
          <AdminEntityChip language={language} size="sm" entity={{ kind: 'community', id: row.community.id, label: row.community.name }} />
        ),
    },
    {
      id: 'members',
      header: translateAdmin(language, 'admin.conversation.col.members'),
      align: 'end',
      cell: (row) => formatCount(row.memberCount, language),
    },
    {
      id: 'state',
      header: translateAdmin(language, 'admin.conversation.col.state'),
      cell: (row) => (
        <Unbroken>
          <AdminInterpretedBadge value={conversationStateOf(row, language)} />
        </Unbroken>
      ),
    },
    {
      id: 'created',
      header: translateAdmin(language, 'admin.conversation.col.created'),
      sortKey: 'createdAt',
      priority: 3,
      cell: (row) => moment(row.createdAt),
    },
    {
      id: 'lastMessage',
      header: translateAdmin(language, 'admin.conversation.col.lastMessage'),
      sortKey: 'lastMessageAt',
      cell: (row) => moment(row.lastMessageAt),
    },
  ];

  const total = list.query.data?.total;
  const scopedCommunity = list.state.ids.communityId;
  const communityName = list.query.data?.rows.find((row) => row.community?.id === scopedCommunity)?.community?.name;

  return (
    <div className="grid gap-6" data-admin-conversations>
      <AdminPageHeader
        language={language}
        title={translateAdmin(language, 'admin.nav.conversations')}
        subtitle={translateAdmin(language, 'admin.conversation.subtitle')}
        crumbs={[{ label: translateAdmin(language, 'admin.group.exchanges') }, { label: translateAdmin(language, 'admin.nav.conversations') }]}
      />
      <AdminOfflineNotice language={language} />
      {scopedCommunity === undefined ? null : (
        <AdminInlineNotice
          tone="info"
          text={
            communityName === undefined
              ? translateAdmin(language, 'admin.conversation.list.onCommunity')
              : translateAdmin(language, 'admin.conversation.list.onCommunityNamed', { name: communityName })
          }
          action={
            <button
              type="button"
              data-admin-list-reset
              onClick={list.reset}
              className="rounded-chip px-3 text-caption font-medium focus-visible:outline-2 focus-visible:outline-offset-2"
              style={{ minHeight: 44, color: 'var(--color-ios-brand)', outlineColor: 'var(--color-ios-brand)' }}
            >
              {translateAdmin(language, 'admin.conversation.list.onCommunityReset')}
            </button>
          }
        />
      )}
      <AdminEntityList
        language={language}
        section="conversations"
        list={list}
        columns={columns}
        rowKey={(row) => row.id}
        rowTarget={(row) => ({ kind: 'entity', entity: 'conversation', id: row.id })}
        caption={translateAdmin(language, 'admin.conversation.list.caption')}
        toolbar={
          <AdminListToolbar
            language={language}
            search={{ label: translateAdmin(language, 'admin.conversation.search'), value: list.draft, onChange: list.setDraft }}
            filters={filters}
            onReset={list.reset}
            {...(total === undefined ? {} : { trailing: translateAdmin(language, 'admin.conversation.list.count', { count: formatCount(total, language) }) })}
          />
        }
        empty={{ title: translateAdmin(language, 'admin.conversation.list.empty'), hint: translateAdmin(language, 'admin.conversation.list.emptyHint') }}
        filteredEmpty={{ title: translateAdmin(language, 'admin.conversation.list.filteredEmpty') }}
      />
    </div>
  );
}

export default function AdminConversationsScreen() {
  const language = currentAdminLanguage();
  suspendForAdminInterfaceCatalog(language);

  return (
    <AdminSectionScreen section="conversations" language={language} title={translateAdmin(language, 'admin.nav.conversations')}>
      {() => <AdminConversationsPanel language={language} />}
    </AdminSectionScreen>
  );
}
