import { AdminInterpretedBadge } from '@/components/admin/badges';
import { AdminEntityChip } from '@/components/admin/entity-chip';
import { AdminFicheSection } from '@/components/admin/fiche';
import { AdminMetaPanel, AdminMetaRow, AdminMomentText, AdminTechnicalId } from '@/components/admin/meta';
import { AdminEmptyState, AdminInlineNotice } from '@/components/admin/states';
import { interpretRedirectStatus, interpretTrackingTarget } from '@/lib/admin/interpret/enums';
import { countryName } from '@/lib/admin/interpret/language';
import { adminMomentOf } from '@/lib/admin/interpret/time';
import { trackingConversationRef, trackingDeviceLabel, trackingLinkState, trackingPlainLabel, trackingTargetRef } from '@/lib/admin/tracking-link-model';
import type { AdminTrackingClick, AdminTrackingLink } from '@/lib/api/admin-tracking-links';
import { translateAdmin } from '@/lib/i18n-admin-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';
import type { AnnouncementTone } from '@/lib/view/use-live-announcer';

import { LinkPerson } from './admin-share-link-parts';
import { CopyableAddress } from './admin-tracking-link-parts';

/**
 * **LES BLOCS DE LA FICHE D'UN LIEN DE SUIVI** (#8876, #6729) — la destination et
 * l'adresse courte (en texte, avec copie), la campagne, la cible nommée, les vingt
 * derniers clics, les métadonnées interprétées.
 *
 * Les derniers clics ne montrent que dix colonnes : le lieu, l'appareil, le navigateur,
 * le système, la provenance, la redirection, l'heure. **Ni adresse IP, ni agent
 * utilisateur, ni empreinte** — la passerelle ne les sert pas, et la fiche le dit.
 */
const INK = 'var(--color-ios-ink)';
const INK2 = 'var(--color-ios-ink-2)';
const EDGE = 'var(--color-edge)';

type Announce = (message: string, tone?: AnnouncementTone) => void;

export function DestinationSection({ language, link, onAnnounce }: { readonly language: InterfaceLanguage; readonly link: AdminTrackingLink; readonly onAnnounce: Announce }) {
  return (
    <AdminFicheSection id="destination" title={translateAdmin(language, 'admin.tracking.section.destination')}>
      <dl className="grid gap-3">
        <AdminMetaRow
          anchor="original"
          label={translateAdmin(language, 'admin.tracking.dest.original')}
          value={link.originalUrl === '' ? '—' : <CopyableAddress language={language} value={link.originalUrl} anchor="original" onAnnounce={onAnnounce} />}
          explain={translateAdmin(language, 'admin.tracking.dest.original.explain')}
        />
        <AdminMetaRow
          anchor="short"
          label={translateAdmin(language, 'admin.tracking.dest.short')}
          value={link.shortUrl === '' ? '—' : <CopyableAddress language={language} value={link.shortUrl} anchor="short" onAnnounce={onAnnounce} />}
          explain={translateAdmin(language, 'admin.tracking.dest.short.explain')}
        />
      </dl>
    </AdminFicheSection>
  );
}

export function CampaignSection({ language, link }: { readonly language: InterfaceLanguage; readonly link: AdminTrackingLink }) {
  const none = translateAdmin(language, 'admin.value.notProvided');
  return (
    <AdminFicheSection id="campaign" title={translateAdmin(language, 'admin.tracking.section.campaign')}>
      <dl className="grid gap-3 sm:grid-cols-3">
        <AdminMetaRow anchor="campaign" label={translateAdmin(language, 'admin.tracking.utm.campaign')} value={link.campaign ?? none} />
        <AdminMetaRow anchor="source" label={translateAdmin(language, 'admin.tracking.utm.source')} value={link.source ?? none} />
        <AdminMetaRow anchor="medium" label={translateAdmin(language, 'admin.tracking.utm.medium')} value={link.medium ?? none} />
      </dl>
    </AdminFicheSection>
  );
}

export function TargetSection({ language, link }: { readonly language: InterfaceLanguage; readonly link: AdminTrackingLink }) {
  const target = trackingTargetRef(link, language);
  const conversation = trackingConversationRef(link, language);
  return (
    <AdminFicheSection id="target" title={translateAdmin(language, 'admin.tracking.section.target')}>
      <dl className="grid gap-3">
        <AdminMetaRow anchor="kind" label={translateAdmin(language, 'admin.tracking.target.kind')} value={interpretTrackingTarget(link.targetType, language).label} />
        {target === null ? null : (
          <AdminMetaRow anchor="entity" label={translateAdmin(language, 'admin.tracking.target.entity')} value={<AdminEntityChip language={language} entity={target} />} />
        )}
        {conversation === null ? null : (
          <AdminMetaRow anchor="conversation" label={translateAdmin(language, 'admin.tracking.target.conversation')} value={<AdminEntityChip language={language} entity={conversation} />} />
        )}
      </dl>
      {target === null ? <AdminInlineNotice tone="neutral" text={translateAdmin(language, 'admin.tracking.target.none')} /> : null}
    </AdminFicheSection>
  );
}

const place = (click: AdminTrackingClick, language: InterfaceLanguage): string => {
  const country = countryName(click.country, language);
  return click.city === null ? country : translateAdmin(language, 'admin.tracking.recent.place', { city: click.city, country });
};

function RecentTable({ language, clicks, now }: { readonly language: InterfaceLanguage; readonly clicks: readonly AdminTrackingClick[]; readonly now: Date }) {
  const when = (click: AdminTrackingClick) => <AdminMomentText moment={adminMomentOf(click.clickedAt, now, language)} />;
  const from = (click: AdminTrackingClick) => click.referrer ?? translateAdmin(language, 'admin.tracking.recent.direct');
  const redirect = (click: AdminTrackingClick) => <AdminInterpretedBadge value={interpretRedirectStatus(click.redirectStatus ?? 'pending', language)} />;
  const headers = (['when', 'where', 'device', 'browser', 'system', 'referrer', 'redirect'] as const).map((id) => ({ id, label: translateAdmin(language, `admin.tracking.recent.${id}`) }));

  return (
    <>
      <div className="hidden overflow-x-auto md:block">
        <table data-admin-recent-clicks className="w-full border-collapse text-start text-caption">
          <caption className="sr-only">{translateAdmin(language, 'admin.tracking.recent.caption')}</caption>
          <thead>
            <tr>
              {headers.map((header) => (
                <th key={header.id} scope="col" className="px-2 py-2 text-start font-medium" style={{ color: INK2, borderBottom: `1px solid ${EDGE}` }}>
                  {header.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {clicks.map((click) => (
              <tr key={click.id} data-admin-click={click.id}>
                {[
                  when(click),
                  place(click, language),
                  trackingDeviceLabel(click.device, language),
                  trackingPlainLabel(click.browser, language),
                  trackingPlainLabel(click.os, language),
                  from(click),
                  redirect(click),
                ].map((cell, index) => (
                  <td key={headers[index]?.id ?? index} className="break-words px-2 py-2" style={{ color: INK, borderBottom: `1px solid ${EDGE}`, maxWidth: '16rem' }}>
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ul className="grid gap-3 md:hidden">
        {clicks.map((click) => (
          <li key={click.id} data-admin-click-card={click.id} className="grid gap-1 rounded-card p-3" style={{ border: `1px solid ${EDGE}` }}>
            <span className="text-body font-medium" style={{ color: INK }}>
              {when(click)}
            </span>
            <span className="text-caption" style={{ color: INK2 }}>
              {[place(click, language), trackingDeviceLabel(click.device, language), trackingPlainLabel(click.browser, language), trackingPlainLabel(click.os, language)].join(' · ')}
            </span>
            <span className="break-words text-caption" style={{ color: INK2 }}>
              {from(click)}
            </span>
            <span>{redirect(click)}</span>
          </li>
        ))}
      </ul>
    </>
  );
}

export function RecentClicksSection({ language, link, now }: { readonly language: InterfaceLanguage; readonly link: AdminTrackingLink; readonly now: Date }) {
  return (
    <AdminFicheSection id="recent" title={translateAdmin(language, 'admin.tracking.section.recent')}>
      {link.recentClicks.length === 0 ? (
        <AdminEmptyState glyph="clock" title={translateAdmin(language, 'admin.tracking.recent.empty')} />
      ) : (
        <RecentTable language={language} clicks={link.recentClicks} now={now} />
      )}
      <p className="text-caption" style={{ color: INK2 }}>
        {translateAdmin(language, 'admin.tracking.recent.privacy')}
      </p>
    </AdminFicheSection>
  );
}

export function TrackingMeta({
  language,
  link,
  now,
  onAnnounce,
}: {
  readonly language: InterfaceLanguage;
  readonly link: AdminTrackingLink;
  readonly now: Date;
  readonly onAnnounce: (message: string) => void;
}) {
  const state = trackingLinkState(link, now, language);
  return (
    <AdminMetaPanel title={translateAdmin(language, 'admin.kit.meta.title')}>
      <AdminMetaRow anchor="state" label={translateAdmin(language, 'admin.tracking.meta.state')} value={<AdminInterpretedBadge value={state} />} explain={state.explain} />
      <AdminMetaRow
        anchor="expires"
        label={translateAdmin(language, 'admin.tracking.meta.expires')}
        value={link.expiresAt === null ? translateAdmin(language, 'admin.tracking.expires.never') : <AdminMomentText moment={adminMomentOf(link.expiresAt, now, language)} variant="both" />}
        explain={link.expiresAt === null ? null : translateAdmin(language, 'admin.tracking.meta.expires.explain')}
      />
      <AdminMetaRow anchor="creator" label={translateAdmin(language, 'admin.tracking.meta.creator')} value={<LinkPerson language={language} person={link.creator} />} />
      <AdminMetaRow anchor="created" label={translateAdmin(language, 'admin.tracking.meta.created')} value={<AdminMomentText moment={adminMomentOf(link.createdAt, now, language)} variant="both" />} />
      <AdminMetaRow
        anchor="lastClick"
        label={translateAdmin(language, 'admin.tracking.meta.lastClick')}
        value={link.lastClickedAt === null ? translateAdmin(language, 'admin.tracking.lastClick.never') : <AdminMomentText moment={adminMomentOf(link.lastClickedAt, now, language)} variant="both" />}
      />
      <AdminTechnicalId language={language} id={link.id} onAnnounce={onAnnounce} />
    </AdminMetaPanel>
  );
}
