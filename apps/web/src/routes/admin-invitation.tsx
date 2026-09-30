import { useQuery } from '@tanstack/react-query';

import { AdminInterpretedBadge } from '@/components/admin/badges';
import { AdminLink } from '@/components/admin/entity-chip';
import { AdminFiche, AdminFicheSection, AdminIdentityHeader, AdminStatStrip } from '@/components/admin/fiche';
import { AdminMetaPanel, AdminMetaRow, AdminMomentText, AdminTechnicalId } from '@/components/admin/meta';
import { AdminPageHeader } from '@/components/admin/page-header';
import { AdminSectionScreen } from '@/components/admin/section-screen';
import { AdminDeniedInline, AdminEmptyState, AdminErrorState, AdminInlineNotice, AdminOfflineNotice } from '@/components/admin/states';
import { interpretInvitationStatus } from '@/lib/admin/interpret/enums';
import { invitationLabel } from '@/lib/admin/interpret/labels';
import { adminMomentOf } from '@/lib/admin/interpret/time';
import { invitationStatusExplain } from '@/lib/admin/invitation-model';
import type { AdminDeps } from '@/lib/api/admin';
import { adminInvitationKey, loadAdminInvitation } from '@/lib/api/admin-invitations';
import { ApiError, unwrap } from '@/lib/api/client';
import { apiDeps } from '@/lib/api/deps';
import { currentAdminLanguage, suspendForAdminInterfaceCatalog, translateAdmin, type AdminLanguage } from '@/lib/i18n-admin-catalog';
import { useOnline } from '@/lib/net/online';
import { useParams } from '@/lib/router';
import { useLiveAnnouncer } from '@/lib/view/use-live-announcer';
import { AdminAnnouncement, AdminSkeleton } from '@/routes/admin-parts';

import { InvitationGestures } from './admin-invitation-gestures';
import { InvitationStatusBadge } from './admin-invitation-parts';
import { LinkPerson } from './admin-share-link-parts';

/**
 * **LA FICHE D'UNE DEMANDE DE CONTACT** (#8876, #6729) — `/admin/invitations/$invitation`.
 *
 * Deux membres nommés (cliquables vers leur fiche), où en est la demande, le message
 * qui l'accompagne, ses dates. Le seul geste est « Annuler la demande », tant
 * qu'elle est en attente. L'adresse e-mail des deux membres, que la passerelle sert
 * encore sur cette route, n'est jamais décodée ni affichée.
 *
 * Fail-closed comme la liste (`canManageUsers`) ; un 403 malgré tout se rend comme un
 * refus, un 404 comme « cette demande n'existe plus » — jamais comme une panne.
 */
const defaultNow = (): Date => new Date();

type InvitationPanelProps = {
  readonly language: AdminLanguage;
  readonly invitationId: string;
  readonly deps?: AdminDeps;
  readonly now?: () => Date;
};

export function AdminInvitationPanel({ language, invitationId, deps = apiDeps, now = defaultNow }: InvitationPanelProps) {
  const online = useOnline();
  const announcer = useLiveAnnouncer();

  const query = useQuery({
    queryKey: adminInvitationKey(invitationId),
    queryFn: async ({ signal }) => unwrap(await loadAdminInvitation({ ...deps, invitationId, signal })),
    staleTime: 15_000,
    retry: false,
    refetchOnWindowFocus: false,
  });
  const invitation = query.data;
  const listTarget = { kind: 'section', section: 'invitations' } as const;

  if (invitation === undefined) {
    if (query.isPending) {
      return (
        <div aria-busy="true" aria-label={translateAdmin(language, 'admin.invitation.fiche.loading')} data-admin-invitation-loading>
          <AdminSkeleton rows={4} />
        </div>
      );
    }
    const status = query.error instanceof ApiError ? query.error.status : 0;
    if (status === 403) return <AdminDeniedInline language={language} />;
    if (status === 404) {
      return (
        <AdminEmptyState
          glyph="handshake"
          title={translateAdmin(language, 'admin.invitation.fiche.notFound')}
          hint={translateAdmin(language, 'admin.invitation.fiche.notFoundHint')}
          action={
            <AdminLink
              target={listTarget}
              anchor="back-to-list"
              className="inline-flex items-center rounded-chip px-5 text-body font-semibold text-white"
              style={{ minHeight: 44, backgroundColor: 'var(--color-ios-brand)' }}
            >
              {translateAdmin(language, 'admin.invitation.fiche.back')}
            </AdminLink>
          }
        />
      );
    }
    return <AdminErrorState language={language} onRetry={() => void query.refetch()} />;
  }

  const clock = now();
  const title = invitationLabel({ sender: invitation.sender, recipient: invitation.receiver }, language);
  const sent = adminMomentOf(invitation.createdAt, clock, language);
  const updated = adminMomentOf(invitation.updatedAt, clock, language);
  const status = interpretInvitationStatus(invitation.status, language);
  const hasMessage = invitation.message !== null;

  return (
    <div className="grid gap-6" data-admin-invitation-fiche>
      <AdminPageHeader
        language={language}
        title={title}
        crumbs={[
          { label: translateAdmin(language, 'admin.group.people') },
          { label: translateAdmin(language, 'admin.nav.invitations'), target: listTarget },
          { label: title },
        ]}
      />
      <AdminOfflineNotice language={language} />
      <AdminFiche
        kind="invitation"
        header={
          <AdminIdentityHeader
            language={language}
            title={title}
            secondary={translateAdmin(language, 'admin.invitation.fiche.secondary', { when: sent?.relative ?? '—' })}
            glyph="handshake"
            badges={<InvitationStatusBadge language={language} status={invitation.status} />}
            actions={<InvitationGestures language={language} invitation={invitation} deps={deps} online={online} announce={announcer.announce} />}
          />
        }
        stats={
          <AdminStatStrip
            items={[
              { id: 'sent', label: translateAdmin(language, 'admin.invitation.strip.sent'), value: sent?.relative ?? '—' },
              { id: 'updated', label: translateAdmin(language, 'admin.invitation.strip.updated'), value: updated?.relative ?? '—' },
              {
                id: 'message',
                label: translateAdmin(language, 'admin.invitation.strip.message'),
                value: translateAdmin(language, hasMessage ? 'admin.invitation.message.yes' : 'admin.invitation.message.no'),
              },
            ]}
          />
        }
        aside={
          <AdminMetaPanel title={translateAdmin(language, 'admin.kit.meta.title')}>
            <AdminMetaRow
              anchor="status"
              label={translateAdmin(language, 'admin.invitation.meta.status')}
              value={<AdminInterpretedBadge value={status} />}
              explain={invitationStatusExplain(invitation.status, language)}
            />
            <AdminMetaRow anchor="sent" label={translateAdmin(language, 'admin.invitation.meta.sent')} value={<AdminMomentText moment={sent} variant="both" />} />
            <AdminMetaRow
              anchor="updated"
              label={translateAdmin(language, 'admin.invitation.meta.updated')}
              value={<AdminMomentText moment={updated} variant="both" />}
              explain={translateAdmin(language, 'admin.invitation.meta.updated.explain')}
            />
            <AdminTechnicalId language={language} id={invitation.id} onAnnounce={announcer.announce} />
          </AdminMetaPanel>
        }
      >
        <AdminFicheSection id="people" title={translateAdmin(language, 'admin.invitation.section.people')}>
          <div className="grid gap-4 sm:grid-cols-2">
            <div data-admin-person="sender" className="grid gap-1">
              <span className="text-caption" style={{ color: 'var(--color-ios-ink-2)' }}>
                {translateAdmin(language, 'admin.invitation.person.sender')}
              </span>
              <LinkPerson language={language} person={invitation.sender} />
              {invitation.sender === null ? null : (
                <AdminLink
                  target={{ kind: 'section', section: 'invitations', search: { senderId: invitation.sender.id } }}
                  anchor="sender-requests"
                  className="inline-flex items-center text-caption font-medium underline-offset-2 hover:underline"
                  style={{ minHeight: 44, color: 'var(--color-ios-brand)' }}
                >
                  {translateAdmin(language, 'admin.invitation.person.senderRequests')}
                </AdminLink>
              )}
            </div>
            <div data-admin-person="receiver" className="grid content-start gap-1">
              <span className="text-caption" style={{ color: 'var(--color-ios-ink-2)' }}>
                {translateAdmin(language, 'admin.invitation.person.receiver')}
              </span>
              <LinkPerson language={language} person={invitation.receiver} />
            </div>
          </div>
        </AdminFicheSection>
        <AdminFicheSection id="message" title={translateAdmin(language, 'admin.invitation.section.message')}>
          {invitation.message === null ? (
            <AdminInlineNotice tone="neutral" text={translateAdmin(language, 'admin.invitation.message.none')} />
          ) : (
            <p className="whitespace-pre-wrap break-words text-body" style={{ color: 'var(--color-ios-ink)' }}>
              {invitation.message}
            </p>
          )}
        </AdminFicheSection>
      </AdminFiche>
      <AdminAnnouncement text={announcer.text} />
    </div>
  );
}

export default function AdminInvitationScreen() {
  const language = currentAdminLanguage();
  suspendForAdminInterfaceCatalog(language);
  const { invitation: invitationId } = useParams<'/admin/invitations/$invitation'>();

  return (
    <AdminSectionScreen section="invitations" language={language} title={translateAdmin(language, 'admin.nav.invitations')}>
      {() => <AdminInvitationPanel language={language} invitationId={invitationId} />}
    </AdminSectionScreen>
  );
}
