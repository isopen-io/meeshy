import { useQuery } from '@tanstack/react-query';
import { useId } from 'react';

import { AdminInterpretedBadge } from '@/components/admin/badges';
import { AdminEntityChip, AdminLink } from '@/components/admin/entity-chip';
import { AdminFiche, AdminFicheSection, AdminIdentityHeader, AdminStatStrip } from '@/components/admin/fiche';
import { AdminMetaPanel, AdminMetaRow, AdminMomentText, AdminTechnicalId } from '@/components/admin/meta';
import { AdminPageHeader } from '@/components/admin/page-header';
import { AdminSectionScreen } from '@/components/admin/section-screen';
import { AdminDeniedInline, AdminEmptyState, AdminErrorState, AdminInlineNotice, AdminOfflineNotice } from '@/components/admin/states';
import { AdminTabPanel, AdminTabs, useAdminTab } from '@/components/admin/tabs';
import { BRAND, EDGE, INK2 } from '@/components/admin/tone';
import { adminGroupOf, type AdminTarget } from '@/lib/admin/admin-routes';
import { withoutMembersList } from '@/lib/admin/community-members-list';
import { communityStateOf, communityVisibilityOf } from '@/lib/admin/community-state';
import { interpretConversationType, interpretParticipantRole } from '@/lib/admin/interpret/enums';
import { personInitials } from '@/lib/admin/interpret/labels';
import { formatCount } from '@/lib/admin/interpret/numbers';
import { adminMomentOf } from '@/lib/admin/interpret/time';
import { communityRef, conversationRef, personRef } from '@/lib/admin/post-entities';
import { useAdminReach } from '@/lib/admin/use-admin-reach';
import type { AdminDeps } from '@/lib/api/admin';
import { adminCommunityQueryKey, loadAdminCommunity, type AdminCommunityFiche } from '@/lib/api/admin-communities-detail';
import { ApiError, unwrap } from '@/lib/api/client';
import { apiDeps } from '@/lib/api/deps';
import { attachmentSrc } from '@/lib/api/media-url';
import { currentAdminLanguage, suspendForAdminInterfaceCatalog, translateAdmin, type AdminLanguage } from '@/lib/i18n-admin-catalog';
import { useParams, useSearch } from '@/lib/router';
import { participantAvatarOf } from '@/lib/view/conversation';
import { useLiveAnnouncer } from '@/lib/view/use-live-announcer';

import { AdminAnnouncement, AdminSkeleton } from './admin-parts';
import { AdminCommunityActions } from './admin-community-actions';
import { AdminCommunityMembers } from './admin-community-members';

/**
 * **LA FICHE D'UNE COMMUNAUTÉ** (#8876) — `/admin/communities/$community` ·
 * `/adm/communities/$community`.
 *
 * Tout ce qu'il faut pour la comprendre et la contrôler : sa bannière et son
 * identité, quatre chiffres (membres actifs, départs, conversations,
 * publications), sa description, son équipe nommée, ses conversations (chacune
 * mène à sa fiche pour qui a le rang), l'onglet des membres, ses métadonnées
 * dites en mots — et les gestes : désactiver / réactiver, rendre privée /
 * publique, chacun confirmé et motivé.
 *
 * Gardée par `canManageGroups`. Les conversations et les membres ne sont des
 * liens que si le lecteur ouvre la section cible ; sinon ce sont des étiquettes.
 */
const TABS = ['overview', 'members'] as const;
const CONVERSATIONS_SHOWN = 20;

function Banner({ language, src }: { readonly language: AdminLanguage; readonly src: string }) {
  return (
    <img
      src={attachmentSrc(src)}
      alt={translateAdmin(language, 'admin.community.banner')}
      loading="lazy"
      decoding="async"
      className="block w-full rounded-card object-cover"
      style={{ aspectRatio: '4 / 1', maxHeight: 200, border: `1px solid ${EDGE}` }}
    />
  );
}

/**
 * « Toutes les conversations de CETTE communauté » : la liste des conversations, filtrée par `communityId`.
 * `null` quand le lecteur n'ouvre pas la section — le chiffre reste du texte, jamais un lien vers un refus.
 */
const conversationsOf = (fiche: AdminCommunityFiche): AdminTarget => ({
  kind: 'section',
  section: 'conversations',
  search: { communityId: fiche.id },
});

function Overview({
  language,
  fiche,
  now,
  seesConversations,
  opensConversations,
}: {
  readonly language: AdminLanguage;
  readonly fiche: AdminCommunityFiche;
  readonly now: Date;
  /** Le rang d'administration : qui parle à qui est l'inventaire des conversations, réservé à BIGBOSS et ADMIN. */
  readonly seesConversations: boolean;
  readonly opensConversations: boolean;
}) {
  const allConversations = conversationsOf(fiche);
  return (
    <>
      <AdminFicheSection id="description" title={translateAdmin(language, 'admin.community.section.description')}>
        {fiche.description === null ? (
          <p className="text-body" style={{ color: INK2 }}>
            {translateAdmin(language, 'admin.community.description.empty')}
          </p>
        ) : (
          <p className="whitespace-pre-wrap break-words text-body">{fiche.description}</p>
        )}
      </AdminFicheSection>

      <AdminFicheSection id="staff" title={translateAdmin(language, 'admin.community.section.staff')}>
        {fiche.staff.length === 0 ? (
          <p className="text-body" style={{ color: INK2 }}>
            {translateAdmin(language, 'admin.community.staff.empty')}
          </p>
        ) : (
          <ul className="grid gap-3">
            {fiche.staff.map((member) => {
              const ref = personRef(member.user, language);
              return (
                <li key={member.user.id} data-admin-staff={member.user.id} className="flex flex-wrap items-center justify-between gap-3">
                  {ref === null ? null : <AdminEntityChip language={language} entity={ref} />}
                  <span className="flex flex-wrap items-center gap-2">
                    <AdminInterpretedBadge value={interpretParticipantRole(member.role, language)} />
                    <span className="text-caption" style={{ color: INK2 }}>
                      <AdminMomentText moment={adminMomentOf(member.joinedAt, now, language)} />
                    </span>
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </AdminFicheSection>

      <AdminFicheSection id="conversations" title={translateAdmin(language, 'admin.community.section.conversations')}>
        {!seesConversations ? (
          <p data-admin-conversations-restricted className="text-body" style={{ color: INK2 }}>
            {translateAdmin(language, 'admin.community.conversations.restricted', { count: formatCount(fiche.conversationCount, language) })}
          </p>
        ) : fiche.conversations.length === 0 ? (
          <p className="text-body" style={{ color: INK2 }}>
            {translateAdmin(language, 'admin.community.conversations.empty')}
          </p>
        ) : (
          <ul className="grid gap-2">
            {fiche.conversations.map((conversation) => {
              const params = { type: interpretConversationType(conversation.type, language).label, count: formatCount(conversation.memberCount, language) };
              const secondary = translateAdmin(language, conversation.isActive ? 'admin.community.conversations.meta' : 'admin.community.conversations.metaInactive', params);
              return (
                <li key={conversation.id} data-admin-conversation={conversation.id}>
                  <AdminEntityChip language={language} entity={conversationRef(conversation, language, secondary)} />
                </li>
              );
            })}
          </ul>
        )}
        {seesConversations && fiche.conversationCount > CONVERSATIONS_SHOWN ? (
          <p className="text-caption" style={{ color: INK2 }}>
            {opensConversations ? (
              <AdminLink
                target={allConversations}
                anchor="all-conversations"
                ariaLabel={translateAdmin(language, 'admin.community.conversations.seeAll')}
                className="inline-flex items-center underline"
                style={{ minHeight: 44, color: BRAND }}
              >
                {translateAdmin(language, 'admin.community.conversations.more', { total: formatCount(fiche.conversationCount, language) })}
              </AdminLink>
            ) : (
              translateAdmin(language, 'admin.community.conversations.more', { total: formatCount(fiche.conversationCount, language) })
            )}
          </p>
        ) : null}
      </AdminFicheSection>
    </>
  );
}

function Metadata({
  language,
  fiche,
  now,
  onAnnounce,
}: {
  readonly language: AdminLanguage;
  readonly fiche: AdminCommunityFiche;
  readonly now: Date;
  readonly onAnnounce: (message: string) => void;
}) {
  const visibility = communityVisibilityOf(fiche.isPrivate, language);
  const state = communityStateOf(fiche.isActive, language);
  const creator = personRef(fiche.creator, language);
  return (
    <AdminMetaPanel title={translateAdmin(language, 'admin.kit.meta.title')}>
      <AdminMetaRow anchor="visibility" label={translateAdmin(language, 'admin.community.meta.visibility')} value={<AdminInterpretedBadge value={visibility} />} explain={visibility.explain} />
      <AdminMetaRow anchor="state" label={translateAdmin(language, 'admin.community.meta.state')} value={<AdminInterpretedBadge value={state} />} explain={state.explain} />
      <AdminMetaRow anchor="identifier" label={translateAdmin(language, 'admin.community.meta.identifier')} value={fiche.identifier === '' ? '—' : fiche.identifier} />
      <AdminMetaRow
        anchor="creator"
        label={translateAdmin(language, 'admin.community.meta.creator')}
        value={creator === null ? '—' : <AdminEntityChip language={language} entity={creator} size="sm" />}
      />
      <AdminMetaRow anchor="created" label={translateAdmin(language, 'admin.community.meta.created')} value={<AdminMomentText moment={adminMomentOf(fiche.createdAt, now, language)} variant="both" />} />
      <AdminMetaRow anchor="updated" label={translateAdmin(language, 'admin.community.meta.updated')} value={<AdminMomentText moment={adminMomentOf(fiche.updatedAt, now, language)} variant="both" />} />
      {fiche.deletedAt === null ? null : (
        <AdminMetaRow
          anchor="deactivated"
          label={translateAdmin(language, 'admin.community.meta.deactivated')}
          value={<AdminMomentText moment={adminMomentOf(fiche.deletedAt, now, language)} variant="both" />}
        />
      )}
      <AdminTechnicalId language={language} id={fiche.id} onAnnounce={onAnnounce} />
    </AdminMetaPanel>
  );
}

export function AdminCommunityPanel({
  language,
  communityId,
  deps = apiDeps,
  now = new Date(),
}: {
  readonly language: AdminLanguage;
  readonly communityId: string;
  readonly deps?: AdminDeps;
  readonly now?: Date;
}) {
  const reach = useAdminReach();
  const announcer = useLiveAnnouncer();
  const [tab, setTab] = useAdminTab(TABS, 'overview');
  const tabsId = useId();
  const [search, setSearch] = useSearch();
  const changeTab = (next: (typeof TABS)[number]) => (next === 'overview' ? setSearch(withoutMembersList(search), true) : setTab(next));

  const query = useQuery({
    queryKey: adminCommunityQueryKey(communityId),
    queryFn: async ({ signal }) => unwrap(await loadAdminCommunity({ ...deps, communityId, signal })),
    enabled: reach.opens('communities'),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
    retry: false,
  });

  const fiche = query.data;
  const section = translateAdmin(language, 'admin.nav.communities');
  const header = (name: string | null) => (
    <AdminPageHeader
      language={language}
      title={name ?? section}
      crumbs={[
        { label: translateAdmin(language, `admin.group.${adminGroupOf('communities')}`) },
        { label: section, target: { kind: 'section', section: 'communities' } },
        ...(name === null ? [] : [{ label: name }]),
      ]}
    />
  );

  if (fiche === undefined || fiche === null) {
    const failure = query.error;
    return (
      <div className="grid gap-6" data-admin-screen="community">
        {header(null)}
        {query.isPending ? (
          <AdminSkeleton rows={4} />
        ) : failure instanceof ApiError && failure.status === 403 ? (
          <AdminDeniedInline language={language} />
        ) : failure instanceof ApiError && failure.status === 404 ? (
          <AdminEmptyState title={translateAdmin(language, 'admin.community.notFound')} hint={translateAdmin(language, 'admin.community.notFound.hint')} glyph="usersThree" />
        ) : (
          <AdminErrorState language={language} onRetry={() => void query.refetch()} />
        )}
      </div>
    );
  }

  const ref = communityRef(fiche, language);
  const photo = participantAvatarOf({ avatar: fiche.avatar });
  const members = { kind: 'entity', entity: 'community', id: fiche.id, search: { tab: 'members' } } as const;

  return (
    <div className="grid gap-6" data-admin-screen="community">
      {header(ref.label)}
      <AdminOfflineNotice language={language} />
      {query.isError ? (
        <AdminInlineNotice
          tone="warning"
          text={translateAdmin(language, 'admin.kit.cached')}
          action={
            <button
              type="button"
              data-admin-retry
              onClick={() => void query.refetch()}
              className="rounded-chip px-3 text-caption font-medium focus-visible:outline-2 focus-visible:outline-offset-2"
              style={{ minHeight: 44, color: BRAND, outlineColor: BRAND }}
            >
              {translateAdmin(language, 'admin.kit.retry')}
            </button>
          }
        />
      ) : null}
      <AdminFiche
        kind="community"
        header={
          <>
            {fiche.banner === null ? null : <Banner language={language} src={fiche.banner} />}
            <AdminIdentityHeader
              language={language}
              title={ref.label}
              {...(ref.secondary === null || ref.secondary === undefined ? {} : { secondary: ref.secondary })}
              avatar={{ initials: personInitials(ref.label), color: 'var(--color-ios-brand)', ...(photo === undefined ? {} : { src: photo }) }}
              badges={
                <>
                  <AdminInterpretedBadge value={communityVisibilityOf(fiche.isPrivate, language)} />
                  <AdminInterpretedBadge value={communityStateOf(fiche.isActive, language)} />
                </>
              }
              actions={reach.can('canManageGroups') ? <AdminCommunityActions language={language} fiche={fiche} deps={deps} onAnnounce={announcer.announce} /> : undefined}
            />
          </>
        }
        stats={
          <AdminStatStrip
            items={[
              { id: 'members', label: translateAdmin(language, 'admin.community.stat.members'), value: formatCount(fiche.activeMemberCount, language), target: members },
              { id: 'left', label: translateAdmin(language, 'admin.community.stat.left'), value: formatCount(fiche.leftMemberCount, language), target: { ...members, search: { tab: 'members', isActive: 'false' } } },
              {
                id: 'conversations',
                label: translateAdmin(language, 'admin.community.stat.conversations'),
                value: formatCount(fiche.conversationCount, language),
                ...(reach.opens('conversations') ? { target: conversationsOf(fiche) } : {}),
              },
              { id: 'posts', label: translateAdmin(language, 'admin.community.stat.posts'), value: formatCount(fiche.postCount, language) },
            ]}
          />
        }
        aside={<Metadata language={language} fiche={fiche} now={now} onAnnounce={announcer.announce} />}
      >
        <AdminTabs
          idBase={tabsId}
          label={translateAdmin(language, 'admin.community.tabs.label')}
          tabs={[
            { id: 'overview', label: translateAdmin(language, 'admin.community.tab.overview') },
            { id: 'members', label: translateAdmin(language, 'admin.community.tab.members'), count: formatCount(fiche.activeMemberCount, language) },
          ]}
          active={tab}
          onChange={changeTab}
        />
        <AdminTabPanel idBase={tabsId} tab={tab}>
          {tab === 'members' ? <AdminCommunityMembers language={language} communityId={fiche.id} deps={deps} now={now} /> : <Overview language={language} fiche={fiche} now={now} seesConversations={reach.hasAdminRank} opensConversations={reach.opens('conversations')} />}
        </AdminTabPanel>
      </AdminFiche>
      <AdminAnnouncement text={announcer.text} />
    </div>
  );
}

export default function AdminCommunityScreen() {
  const language = currentAdminLanguage();
  suspendForAdminInterfaceCatalog(language);
  const { community } = useParams<'/admin/communities/$community'>();
  return (
    <AdminSectionScreen section="communities" language={language} title={translateAdmin(language, 'admin.nav.communities')}>
      {() => <AdminCommunityPanel language={language} communityId={community} />}
    </AdminSectionScreen>
  );
}
