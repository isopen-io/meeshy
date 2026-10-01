import { useQuery } from '@tanstack/react-query';

import { AdminLink } from '@/components/admin/entity-chip';
import { AdminFiche, AdminIdentityHeader, AdminStatStrip } from '@/components/admin/fiche';
import { AdminPageHeader } from '@/components/admin/page-header';
import { AdminSectionScreen } from '@/components/admin/section-screen';
import { AdminDeniedInline, AdminEmptyState, AdminErrorState, AdminOfflineNotice } from '@/components/admin/states';
import { excerptOf, personLabel, shareLinkLabel } from '@/lib/admin/interpret/labels';
import { formatCount } from '@/lib/admin/interpret/numbers';
import { adminMomentOf } from '@/lib/admin/interpret/time';
import { shareLinkUsage } from '@/lib/admin/share-link-model';
import type { AdminReach } from '@/lib/admin/use-admin-reach';
import type { AdminDeps } from '@/lib/api/admin';
import { adminShareLinkKey, loadAdminShareLink } from '@/lib/api/admin-share-links';
import { ApiError, unwrap } from '@/lib/api/client';
import { apiDeps } from '@/lib/api/deps';
import { currentAdminLanguage, suspendForAdminInterfaceCatalog, translateAdmin, type AdminLanguage } from '@/lib/i18n-admin-catalog';
import { useOnline } from '@/lib/net/online';
import { useParams } from '@/lib/router';
import { useLiveAnnouncer } from '@/lib/view/use-live-announcer';
import { AdminAnnouncement, AdminSkeleton } from '@/routes/admin-parts';

import { ShareLinkGestures } from './admin-share-link-gestures';
import { ShareLinkStateBadge } from './admin-share-link-parts';
import {
  ConversationSection,
  GuestsSection,
  PermissionsSection,
  RequirementsSection,
  RestrictionsSection,
  ShareLinkMeta,
} from './admin-share-link-sections';

/**
 * **LA FICHE D'UN LIEN DE PARTAGE** (#8876, #6729) — `/admin/share-links/$link`.
 *
 * Tout ce qu'il faut pour COMPRENDRE un lien sans quitter la page : la conversation
 * qu'il ouvre, qui l'a créé, combien il a servi (utilisations, connectés, sessions),
 * ce que ses invités peuvent faire EN PHRASES, ce qu'il exige, ce qu'il restreint
 * (pays et langues nommés), qui est arrivé par lui. Puis les gestes : fermer,
 * rouvrir, et — au seul rang souverain — révéler le secret.
 *
 * Fail-closed comme la liste (`canManageConversations`) ; un 403 malgré tout se rend
 * comme un refus, un 404 comme « ce lien n'existe plus » — jamais comme une panne.
 */
const defaultNow = (): Date => new Date();

type ShareLinkPanelProps = {
  readonly language: AdminLanguage;
  readonly shareLinkId: string;
  readonly reach: AdminReach;
  readonly deps?: AdminDeps;
  readonly now?: () => Date;
};

export function AdminShareLinkPanel({ language, shareLinkId, reach, deps = apiDeps, now = defaultNow }: ShareLinkPanelProps) {
  const online = useOnline();
  const announcer = useLiveAnnouncer();

  const query = useQuery({
    queryKey: adminShareLinkKey(shareLinkId),
    queryFn: async ({ signal }) => unwrap(await loadAdminShareLink({ ...deps, shareLinkId, signal })),
    staleTime: 15_000,
    retry: false,
    refetchOnWindowFocus: false,
  });
  const link = query.data;
  const listTarget = { kind: 'section', section: 'shareLinks' } as const;

  if (link === undefined) {
    if (query.isPending) {
      return (
        <div aria-busy="true" aria-label={translateAdmin(language, 'admin.shareLink.fiche.loading')} data-admin-share-link-loading>
          <AdminSkeleton rows={4} />
        </div>
      );
    }
    const status = query.error instanceof ApiError ? query.error.status : 0;
    if (status === 403) return <AdminDeniedInline language={language} />;
    if (status === 404) {
      return (
        <AdminEmptyState
          glyph="linkSimple"
          title={translateAdmin(language, 'admin.shareLink.fiche.notFound')}
          hint={translateAdmin(language, 'admin.shareLink.fiche.notFoundHint')}
          action={
            <AdminLink
              target={listTarget}
              anchor="back-to-list"
              className="inline-flex items-center rounded-chip px-5 text-body font-semibold text-ios-on-brand"
              style={{ minHeight: 44, backgroundColor: 'var(--color-ios-brand)' }}
            >
              {translateAdmin(language, 'admin.shareLink.fiche.back')}
            </AdminLink>
          }
        />
      );
    }
    return <AdminErrorState language={language} onRetry={() => void query.refetch()} />;
  }

  const clock = now();
  const title = shareLinkLabel(link, language);
  const created = adminMomentOf(link.createdAt, clock, language);
  const uses = shareLinkUsage(link.currentUses, link.maxUses, language);

  return (
    <div className="grid gap-6" data-admin-share-link-fiche>
      <AdminPageHeader
        language={language}
        title={title}
        crumbs={[
          { label: translateAdmin(language, 'admin.group.exchanges') },
          { label: translateAdmin(language, 'admin.nav.shareLinks'), target: listTarget },
          { label: title },
        ]}
      />
      <AdminOfflineNotice language={language} />
      <AdminFiche
        kind="shareLink"
        header={
          <AdminIdentityHeader
            language={language}
            title={title}
            secondary={
              excerptOf(link.description, 120) ??
              translateAdmin(language, 'admin.shareLink.fiche.secondary', { creator: personLabel(link.creator, language), when: created?.relative ?? '—' })
            }
            glyph="linkSimple"
            badges={<ShareLinkStateBadge language={language} link={link} now={clock} />}
            actions={<ShareLinkGestures language={language} link={link} reach={reach} deps={deps} online={online} announce={announcer.announce} />}
          />
        }
        stats={
          <AdminStatStrip
            items={[
              { id: 'uses', label: translateAdmin(language, 'admin.shareLink.strip.uses'), value: uses },
              { id: 'visits', label: translateAdmin(language, 'admin.shareLink.strip.visits'), value: formatCount(link.visitCount, language) },
              { id: 'guests', label: translateAdmin(language, 'admin.shareLink.strip.guests'), value: formatCount(link.guestCount, language) },
              {
                id: 'concurrent',
                label: translateAdmin(language, 'admin.shareLink.strip.concurrent'),
                value: shareLinkUsage(link.currentConcurrentUsers, link.maxConcurrentUsers, language),
              },
              {
                id: 'sessions',
                label: translateAdmin(language, 'admin.shareLink.strip.sessions'),
                value: shareLinkUsage(link.currentUniqueSessions, link.maxUniqueSessions, language),
              },
            ]}
          />
        }
        aside={<ShareLinkMeta language={language} link={link} now={clock} onAnnounce={announcer.announce} />}
      >
        <ConversationSection language={language} link={link} />
        <PermissionsSection language={language} link={link} />
        <RequirementsSection language={language} link={link} />
        <RestrictionsSection language={language} link={link} />
        <GuestsSection language={language} link={link} now={clock} />
      </AdminFiche>
      <AdminAnnouncement text={announcer.text} />
    </div>
  );
}

export default function AdminShareLinkScreen() {
  const language = currentAdminLanguage();
  suspendForAdminInterfaceCatalog(language);
  const { link: shareLinkId } = useParams<'/admin/share-links/$link'>();

  return (
    <AdminSectionScreen section="shareLinks" language={language} title={translateAdmin(language, 'admin.nav.shareLinks')}>
      {(reach) => <AdminShareLinkPanel language={language} shareLinkId={shareLinkId} reach={reach} />}
    </AdminSectionScreen>
  );
}
