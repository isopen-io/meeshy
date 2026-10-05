import { useQuery } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';

import { AdminBadge, AdminInterpretedBadge } from '@/components/admin/badges';
import { AdminEntityIdentity, type AdminEntityRef } from '@/components/admin/entity-chip';
import { AdminFicheSection } from '@/components/admin/fiche';
import { AdminMetaRow, AdminMomentText, AdminNotProvided } from '@/components/admin/meta';
import { AdminResponsiveRows, type AdminColumn } from '@/components/admin/responsive-rows';
import { AdminEmptyState } from '@/components/admin/states';
import type { AdminTarget } from '@/lib/admin/admin-routes';
import {
  interpretAccountState,
  interpretFriendStatus,
  interpretParticipantRole,
  interpretReportStatus,
  interpretReportType,
  interpretReportedEntity,
  interpretSecurityStatus,
  interpretSeverity,
} from '@/lib/admin/interpret/enums';
import { formatCount } from '@/lib/admin/interpret/numbers';
import { adminDate, adminMomentOf, formatDuration } from '@/lib/admin/interpret/time';
import { securityEventLabel } from '@/lib/admin/user-dossier-labels';
import { userEntityOf } from '@/lib/admin/user-entity';
import type { AdminDeps } from '@/lib/api/admin';
import {
  adminUserActivityQueryKey,
  adminUserCommunitiesQueryKey,
  adminUserReportsFiledQueryKey,
  adminUserReportsReceivedQueryKey,
  adminUserSecurityQueryKey,
  adminUserVoiceQueryKey,
  loadAdminUserActivity,
  loadAdminUserCommunities,
  loadAdminUserReportsFiled,
  loadAdminUserReportsReceived,
  loadAdminUserSecurityEvents,
  loadAdminUserVoice,
  type AdminCommunity,
  type AdminContact,
  type AdminReport,
  type AdminSecurityEvent,
} from '@/lib/api/admin-user-dossier';
import { apiDeps } from '@/lib/api/deps';
import { translateAdmin, type AdminLanguage } from '@/lib/i18n-admin-catalog';
import type { AnnouncementTone } from '@/lib/view/use-live-announcer';

import { DossierGate, DossierList, servi } from './admin-user-dossier-list';
import { AdminUserSessionsList } from './admin-user-sessions';

/**
 * **LE DOSSIER D'UN MEMBRE, ONGLET PAR ONGLET** (#7845, #7873, #8876) — contacts,
 * communautés, profil vocal, sécurité, signalements.
 *
 * Chaque onglet ne lit sa route qu'à son OUVERTURE : la fiche ne frappe pas
 * sept adresses pour en montrer une, et la consultation du profil vocal — que
 * la passerelle trace — n'est journalisée que si on l'a vraiment regardé.
 *
 * Un échec se DIT (#6862) : hors ligne on nomme la coupure, en ligne la
 * passerelle ; un 403 sur la sécurité dit que la section est réservée. Un
 * vide avalé se lirait comme « ce membre n'a rien », et l'administrateur
 * classerait le dossier.
 *
 * ## Tout se lit en mots (#8876)
 *
 * Une personne est un CHIP (avatar, vrai nom, `@pseudo`, lien vers sa fiche dans
 * l'espace courant) ; un statut, un motif, une gravité, un rôle passent par la
 * bibliothèque d'interprétation — jamais `accepted`, `hate_speech` ou
 * `LOGIN_FAILED` bruts. Aucune couleur n'est écrite en dur : les tons sont ceux du kit.
 *
 * ## Les mêmes listes que le reste de l'administration
 *
 * Chaque onglet passe par le gabarit commun (`AdminResponsiveRows` : un tableau dès `@3xl`, des
 * cartes dessous — plus aucun tableau qui défile de côté à 375 px) et par les états du kit
 * (`DossierGate` : squelette annoncé, 403 = bloc réservé, panne AVEC « Réessayer », vide dessiné).
 * Un signalement ouvre sa fiche quand la modération est ouverte au lecteur ; une valeur absente se dit
 * « Non renseigné », jamais un tiret nu. Les sessions ouvertes se révoquent (`AdminUserSessionsList`).
 */

const INK2 = 'var(--color-ios-ink-2)';
const SOUVERAIN = { gcTime: 0, retry: false } as const;

function Titre({ children }: { readonly children: ReactNode }) {
  return (
    <h2 className="pb-2 text-body font-semibold" style={{ color: 'var(--color-ios-ink)' }}>
      {children}
    </h2>
  );
}

type TabProps = { readonly userId: string; readonly language: AdminLanguage; readonly deps?: AdminDeps; readonly now?: () => Date };

const moment = (iso: string | null, now: Date, language: AdminLanguage) => <AdminMomentText moment={adminMomentOf(iso, now, language)} />;

const textOrNotProvided = (text: string, language: AdminLanguage): ReactNode => (text === '' ? <AdminNotProvided language={language} /> : text);

const targetOf = (entity: AdminEntityRef): AdminTarget => ({ kind: 'entity', entity: entity.kind, id: entity.id });

const identityColumn = <Row,>(header: string, entityOf: (row: Row) => AdminEntityRef, language: AdminLanguage): AdminColumn<Row> => ({
  id: 'identity',
  header,
  primary: true,
  cell: (row) => <AdminEntityIdentity language={language} size="sm" entity={entityOf(row)} />,
});

export function AdminUserContactsTab({ userId, language, deps = apiDeps, now = () => new Date() }: TabProps) {
  const activite = useQuery({
    queryKey: adminUserActivityQueryKey(userId),
    queryFn: ({ signal }) => servi(loadAdminUserActivity({ ...deps, userId, signal })),
    retry: false,
  });
  const instant = now();
  const contactEntity = (contact: AdminContact) => userEntityOf(contact.other, language, instant);
  const columns: readonly AdminColumn<AdminContact>[] = [
    identityColumn(translateAdmin(language, 'admin.col.member'), contactEntity, language),
    { id: 'direction', header: translateAdmin(language, 'admin.contacts.direction'), cell: (contact) => translateAdmin(language, contact.direction === 'sent' ? 'admin.contacts.sent' : 'admin.contacts.received') },
    { id: 'status', header: translateAdmin(language, 'admin.col.status'), cell: (contact) => <AdminInterpretedBadge value={interpretFriendStatus(contact.status, language)} /> },
    { id: 'date', header: translateAdmin(language, 'admin.people.dossier.contactDate'), cell: (contact) => moment(contact.createdAt, instant, language) },
  ];

  return (
    <div className="grid gap-3" data-admin-contacts>
      <DossierGate language={language} query={activite} rows={4}>
        {({ contacts, shareLinks, trackingLinks, affiliateTokens }) => (
          <>
            <p className="text-caption" style={{ color: INK2 }}>
              {translateAdmin(language, 'admin.contacts.links', {
                share: String(shareLinks),
                tracking: String(trackingLinks),
                affiliate: String(affiliateTokens),
              })}
            </p>
            {contacts.length === 0 ? (
              <AdminEmptyState title={translateAdmin(language, 'admin.dossier.empty')} glyph="list" />
            ) : (
              <AdminResponsiveRows
                columns={columns}
                rows={contacts}
                rowKey={(contact) => contact.id}
                rowTarget={(contact) => targetOf(contactEntity(contact))}
                rowAttributes={(contact) => ({ 'data-admin-contact': contact.id })}
                caption={translateAdmin(language, 'admin.tab.contacts')}
              />
            )}
          </>
        )}
      </DossierGate>
    </div>
  );
}

const communityEntity = (communaute: AdminCommunity, language: AdminLanguage): AdminEntityRef => ({
  kind: 'community',
  id: communaute.id,
  label: communaute.name,
  secondary: communaute.isPrivate ? `${communaute.identifier} · ${translateAdmin(language, 'admin.communities.private')}` : communaute.identifier,
  avatarUrl: communaute.avatar === '' ? null : communaute.avatar,
});

export function AdminUserCommunitiesTab({ userId, language, deps = apiDeps }: TabProps) {
  const [offset, setOffset] = useState(0);
  const liste = useQuery({
    queryKey: adminUserCommunitiesQueryKey(userId, offset),
    queryFn: ({ signal }) => servi(loadAdminUserCommunities({ ...deps, userId, offset, signal })),
    retry: false,
  });
  const columns: readonly AdminColumn<AdminCommunity>[] = [
    identityColumn(translateAdmin(language, 'admin.tab.communities'), (communaute) => communityEntity(communaute, language), language),
    {
      id: 'role',
      header: translateAdmin(language, 'admin.col.role'),
      cell: (communaute) => (
        <span className="inline-flex flex-wrap items-center justify-end gap-1">
          <AdminInterpretedBadge value={interpretParticipantRole(communaute.role, language)} />
          {communaute.isCreator ? <AdminBadge tone="brand">{translateAdmin(language, 'admin.communities.creator')}</AdminBadge> : null}
        </span>
      ),
    },
    { id: 'members', header: translateAdmin(language, 'admin.col.members'), align: 'end', cell: (communaute) => formatCount(communaute.memberCount, language) },
    {
      id: 'status',
      header: translateAdmin(language, 'admin.col.status'),
      cell: (communaute) =>
        communaute.isActive ? (
          <AdminInterpretedBadge value={interpretAccountState('active', language)} />
        ) : (
          <AdminBadge tone="neutral">{translateAdmin(language, 'admin.people.dossier.memberLeft')}</AdminBadge>
        ),
    },
    { id: 'joined', header: translateAdmin(language, 'admin.col.joined'), cell: (communaute) => adminDate(communaute.joinedAt, language) },
  ];

  return (
    <div data-admin-communities>
      <DossierList
        language={language}
        query={liste}
        offset={offset}
        onOffset={setOffset}
        columns={columns}
        rowKey={(communaute) => communaute.id}
        rowTarget={(communaute) => targetOf(communityEntity(communaute, language))}
        rowAttributes={(communaute) => ({ 'data-admin-community': communaute.id })}
        caption={translateAdmin(language, 'admin.tab.communities')}
      />
    </div>
  );
}

export function AdminUserVoiceTab({ userId, language, deps = apiDeps }: TabProps) {
  const voix = useQuery({
    queryKey: adminUserVoiceQueryKey(userId),
    queryFn: ({ signal }) => servi(loadAdminUserVoice({ ...deps, userId, signal })),
    ...SOUVERAIN,
  });

  return (
    <div className="grid gap-4" data-admin-voice>
      <DossierGate language={language} query={voix}>
        {({ profile, consents }) => {
          const consentement = (valeur: string | null) =>
            valeur === null ? translateAdmin(language, 'admin.people.consent.notGiven') : translateAdmin(language, 'admin.people.consent.givenOn', { date: adminDate(valeur, language) });
          return (
            <>
              <div className="grid gap-4 @4xl:grid-cols-2">
                <AdminFicheSection id="voice-profile" title={translateAdmin(language, 'admin.tab.voice')}>
                  {profile === null ? (
                    <p className="text-caption" style={{ color: INK2 }}>
                      {translateAdmin(language, 'admin.voice.none')}
                    </p>
                  ) : (
                    <dl className="grid gap-3">
                      <AdminMetaRow label={translateAdmin(language, 'admin.voice.samples')} value={formatCount(profile.audioCount, language)} />
                      <AdminMetaRow label={translateAdmin(language, 'admin.voice.duration')} value={formatDuration(profile.totalDurationMs, 'ms', language)} />
                      <AdminMetaRow label={translateAdmin(language, 'admin.voice.model')} value={textOrNotProvided(profile.model, language)} />
                      <AdminMetaRow label={translateAdmin(language, 'admin.col.createdOn')} value={adminDate(profile.createdAt, language)} />
                    </dl>
                  )}
                </AdminFicheSection>
                <AdminFicheSection id="voice-consents" title={translateAdmin(language, 'admin.voice.consents')}>
                  <dl className="grid gap-3">
                    <AdminMetaRow label={translateAdmin(language, 'admin.voice.consentProfile')} value={consentement(consents.voiceProfile)} />
                    <AdminMetaRow label={translateAdmin(language, 'admin.voice.consentData')} value={consentement(consents.voiceData)} />
                    <AdminMetaRow label={translateAdmin(language, 'admin.voice.consentCloning')} value={consentement(consents.voiceCloning)} />
                  </dl>
                </AdminFicheSection>
              </div>
              <p className="text-caption" style={{ color: INK2 }}>
                {translateAdmin(language, 'admin.voice.traced')}
              </p>
            </>
          );
        }}
      </DossierGate>
    </div>
  );
}

export function AdminUserSecurityTab({
  userId,
  language,
  deps = apiDeps,
  now = () => new Date(),
  onAnnounce,
}: TabProps & { readonly onAnnounce: (message: string, tone?: AnnouncementTone) => void }) {
  const [offsetEvenements, setOffsetEvenements] = useState(0);
  const instant = now();
  const evenements = useQuery({
    queryKey: adminUserSecurityQueryKey(userId, offsetEvenements),
    queryFn: ({ signal }) => servi(loadAdminUserSecurityEvents({ ...deps, userId, offset: offsetEvenements, signal })),
    ...SOUVERAIN,
  });
  const columns: readonly AdminColumn<AdminSecurityEvent>[] = [
    {
      id: 'event',
      header: translateAdmin(language, 'admin.security.event'),
      primary: true,
      cell: (evenement) => (
        <span className="min-w-0 text-start">
          <span className="block text-caption font-medium">{securityEventLabel(evenement.eventType, language)}</span>
          {evenement.description === '' ? null : (
            <span className="block break-words text-caption" style={{ color: INK2 }}>
              {evenement.description}
            </span>
          )}
        </span>
      ),
    },
    { id: 'severity', header: translateAdmin(language, 'admin.security.severity'), cell: (evenement) => <AdminInterpretedBadge value={interpretSeverity(evenement.severity, language)} /> },
    { id: 'status', header: translateAdmin(language, 'admin.people.dossier.eventStatus'), cell: (evenement) => <AdminInterpretedBadge value={interpretSecurityStatus(evenement.status, language)} /> },
    { id: 'ip', header: translateAdmin(language, 'admin.security.ip'), cell: (evenement) => textOrNotProvided(evenement.ipAddress, language) },
    { id: 'date', header: translateAdmin(language, 'admin.col.date'), cell: (evenement) => moment(evenement.createdAt, instant, language) },
  ];

  return (
    <div className="grid gap-6" data-admin-security>
      <section>
        <Titre>{translateAdmin(language, 'admin.security.sessions')}</Titre>
        <AdminUserSessionsList userId={userId} language={language} deps={deps} now={instant} onAnnounce={onAnnounce} />
      </section>
      <section>
        <Titre>{translateAdmin(language, 'admin.security.events')}</Titre>
        <DossierList
          language={language}
          query={evenements}
          offset={offsetEvenements}
          onOffset={setOffsetEvenements}
          columns={columns}
          rowKey={(evenement) => evenement.id}
          caption={translateAdmin(language, 'admin.security.events')}
        />
      </section>
    </div>
  );
}

const reportColumns = (language: AdminLanguage, recu: boolean, now: Date): readonly AdminColumn<AdminReport>[] => [
  {
    id: 'subject',
    header: translateAdmin(language, recu ? 'admin.reports.reporter' : 'admin.reports.subject'),
    primary: true,
    /* Un signalement REÇU nomme son auteur (texte servi) ; un signalement FAIT dit le genre de ce qu'il vise. */
    cell: (report) => (
      <span className="min-w-0 break-words text-start text-caption font-medium">
        {report.subject === '' ? <AdminNotProvided language={language} /> : recu ? report.subject : interpretReportedEntity(report.subject, language).label}
      </span>
    ),
  },
  { id: 'type', header: translateAdmin(language, 'admin.col.type'), cell: (report) => interpretReportType(report.reportType, language).label },
  { id: 'reason', header: translateAdmin(language, 'admin.reports.reason'), cell: (report) => textOrNotProvided(report.reason, language) },
  ...(recu
    ? [
        {
          id: 'message',
          header: translateAdmin(language, 'admin.reports.message'),
          cell: (report: AdminReport) => report.excerpt ?? <span style={{ color: INK2 }}>{translateAdmin(language, 'admin.reports.withheld')}</span>,
        },
      ]
    : []),
  { id: 'status', header: translateAdmin(language, 'admin.col.status'), cell: (report) => <AdminInterpretedBadge value={interpretReportStatus(report.status, language)} /> },
  { id: 'date', header: translateAdmin(language, 'admin.col.date'), cell: (report) => moment(report.createdAt, now, language) },
];

/** Chaque ligne ouvre SA fiche de signalement — seulement si le lecteur peut ouvrir la modération (`AdminLink`). */
const reportTarget = (report: AdminReport): AdminTarget => ({ kind: 'entity', entity: 'report', id: report.id });

export function AdminUserReportsTab({ userId, language, deps = apiDeps, now = () => new Date() }: TabProps) {
  const [offsetFaits, setOffsetFaits] = useState(0);
  const [offsetRecus, setOffsetRecus] = useState(0);
  const instant = now();
  const faits = useQuery({
    queryKey: adminUserReportsFiledQueryKey(userId, offsetFaits),
    queryFn: ({ signal }) => servi(loadAdminUserReportsFiled({ ...deps, userId, offset: offsetFaits, signal })),
    retry: false,
  });
  const recus = useQuery({
    queryKey: adminUserReportsReceivedQueryKey(userId, offsetRecus),
    queryFn: ({ signal }) => servi(loadAdminUserReportsReceived({ ...deps, userId, offset: offsetRecus, signal })),
    ...SOUVERAIN,
  });

  return (
    <div className="grid gap-6" data-admin-reports>
      <section>
        <Titre>{translateAdmin(language, 'admin.reports.received')}</Titre>
        <DossierList
          language={language}
          query={recus}
          offset={offsetRecus}
          onOffset={setOffsetRecus}
          columns={reportColumns(language, true, instant)}
          rowKey={(report) => report.id}
          rowTarget={reportTarget}
          rowAttributes={(report) => ({ 'data-admin-report': report.id })}
          caption={translateAdmin(language, 'admin.reports.received')}
        />
      </section>
      <section>
        <Titre>{translateAdmin(language, 'admin.reports.filed')}</Titre>
        <DossierList
          language={language}
          query={faits}
          offset={offsetFaits}
          onOffset={setOffsetFaits}
          columns={reportColumns(language, false, instant)}
          rowKey={(report) => report.id}
          rowTarget={reportTarget}
          rowAttributes={(report) => ({ 'data-admin-report': report.id })}
          caption={translateAdmin(language, 'admin.reports.filed')}
        />
      </section>
    </div>
  );
}
