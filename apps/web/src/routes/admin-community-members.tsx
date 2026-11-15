import { AdminBadge, AdminInterpretedBadge } from '@/components/admin/badges';
import { AdminEntityIdentity } from '@/components/admin/entity-chip';
import { AdminEntityList, type AdminColumn } from '@/components/admin/entity-list';
import { AdminListToolbar } from '@/components/admin/list-toolbar';
import { AdminMomentText } from '@/components/admin/meta';
import { COMMUNITY_ROLES } from '@/lib/admin/community-list';
import { useCommunityMembersList } from '@/lib/admin/community-members-list';
import { interpretParticipantRole } from '@/lib/admin/interpret/enums';
import { formatCount } from '@/lib/admin/interpret/numbers';
import { adminMomentOf } from '@/lib/admin/interpret/time';
import { personRef } from '@/lib/admin/post-entities';
import type { AdminDeps } from '@/lib/api/admin';
import type { AdminCommunityMember } from '@/lib/api/admin-communities-detail';
import { translateAdmin, type AdminLanguage } from '@/lib/i18n-admin-catalog';

/**
 * **LES MEMBRES D'UNE COMMUNAUTÉ** (#8876) — l'onglet « Membres » de la fiche :
 * qui, avec quel rôle, depuis quand, et s'ils sont encore là. Recherche par nom
 * ou pseudo, filtre de rôle et de présence, pagination — dans l'adresse, sous
 * `?tab=members`. Chaque ligne ouvre la fiche du membre (si le lecteur ouvre la
 * section des comptes).
 *
 * Un membre n'est servi que par son identité publique : ni présence, ni
 * coordonnées — la liste n'en dessine donc aucune.
 */
export function AdminCommunityMembers({
  language,
  communityId,
  deps,
  now,
}: {
  readonly language: AdminLanguage;
  readonly communityId: string;
  readonly deps: AdminDeps;
  readonly now: Date;
}) {
  const list = useCommunityMembersList({ communityId, deps, enabled: true });
  const all = { value: '', label: translateAdmin(language, 'admin.list.all') };
  const total = list.query.data?.total;

  const columns: readonly AdminColumn<AdminCommunityMember>[] = [
    {
      id: 'member',
      header: translateAdmin(language, 'admin.community.members.col.member'),
      primary: true,
      cell: (row) => {
        const member = personRef(row.user, language);
        return member === null ? null : <AdminEntityIdentity language={language} entity={member} />;
      },
    },
    {
      id: 'role',
      header: translateAdmin(language, 'admin.community.members.col.role'),
      cell: (row) => <AdminInterpretedBadge value={interpretParticipantRole(row.role, language)} />,
    },
    {
      id: 'state',
      header: translateAdmin(language, 'admin.community.members.col.state'),
      cell: (row) =>
        row.isActive ? (
          <AdminBadge tone="success" glyph="checkCircle">
            {translateAdmin(language, 'admin.community.members.state.present')}
          </AdminBadge>
        ) : (
          <AdminBadge tone="neutral">{translateAdmin(language, 'admin.community.members.state.left')}</AdminBadge>
        ),
    },
    {
      id: 'joined',
      header: translateAdmin(language, 'admin.community.members.col.joined'),
      cell: (row) => <AdminMomentText moment={adminMomentOf(row.joinedAt, now, language)} />,
    },
    {
      id: 'left',
      header: translateAdmin(language, 'admin.community.members.col.left'),
      priority: 3,
      cell: (row) => <AdminMomentText moment={adminMomentOf(row.leftAt, now, language)} />,
    },
  ];

  return (
    <AdminEntityList
      language={language}
      section="communities"
      list={list}
      columns={columns}
      rowKey={(row) => row.id}
      rowTarget={(row) => ({ kind: 'entity', entity: 'user', id: row.user.id })}
      caption={translateAdmin(language, 'admin.community.members.caption')}
      empty={{ title: translateAdmin(language, 'admin.community.members.empty'), hint: translateAdmin(language, 'admin.community.members.empty.hint') }}
      filteredEmpty={{ title: translateAdmin(language, 'admin.community.members.filtered') }}
      toolbar={
        <AdminListToolbar
          language={language}
          search={{ label: translateAdmin(language, 'admin.community.members.search'), value: list.draft, onChange: list.setDraft }}
          filters={[
            {
              id: 'role',
              label: translateAdmin(language, 'admin.community.members.filter.role'),
              value: list.state.filters.role ?? '',
              options: [all, ...COMMUNITY_ROLES.map((role) => ({ value: role, label: interpretParticipantRole(role, language).label }))],
              onChange: (value) => list.filter('role', value),
            },
            {
              id: 'isActive',
              label: translateAdmin(language, 'admin.community.members.filter.active'),
              value: list.state.filters.isActive ?? '',
              options: [
                all,
                { value: 'true', label: translateAdmin(language, 'admin.community.members.active.yes') },
                { value: 'false', label: translateAdmin(language, 'admin.community.members.active.no') },
              ],
              onChange: (value) => list.filter('isActive', value),
            },
          ]}
          onReset={list.reset}
          {...(total === undefined ? {} : { trailing: translateAdmin(language, 'admin.community.members.count', { count: formatCount(total, language) }) })}
        />
      }
    />
  );
}
