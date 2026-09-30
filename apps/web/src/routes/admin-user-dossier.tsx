import { useQuery } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';

import { AdminBadge, AdminInterpretedBadge } from '@/components/admin/badges';
import { AdminEntityChip } from '@/components/admin/entity-chip';
import { AdminMomentText } from '@/components/admin/meta';
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
  ADMIN_DOSSIER_PAGE_SIZE,
  adminUserActivityQueryKey,
  adminUserCommunitiesQueryKey,
  adminUserReportsFiledQueryKey,
  adminUserReportsReceivedQueryKey,
  adminUserSecurityQueryKey,
  adminUserSessionsQueryKey,
  adminUserVoiceQueryKey,
  loadAdminUserActivity,
  loadAdminUserCommunities,
  loadAdminUserReportsFiled,
  loadAdminUserReportsReceived,
  loadAdminUserSecurityEvents,
  loadAdminUserSessions,
  loadAdminUserVoice,
  type AdminDossierPage,
  type AdminCommunity,
  type AdminReport,
} from '@/lib/api/admin-user-dossier';
import { apiDeps } from '@/lib/api/deps';
import type { ApiResult } from '@/lib/api/http';
import { translateAdmin, type AdminLanguage } from '@/lib/i18n-admin-catalog';
import { useOnline } from '@/lib/net/online';

import { AdminLine, AdminSection, AdminSkeleton } from './admin-parts';
import { AdminPager, AdminTable, PlainTh, Td } from './admin-table';

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
 */

const INK2 = 'var(--color-ios-ink-2)';
const SOUVERAIN = { gcTime: 0, retry: false } as const;

/** Un échec qui garde son STATUT : un 403 ne se dit pas comme une panne. */
class LectureRefusee extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function servi<T>(promesse: Promise<ApiResult<T>>): Promise<T> {
  const resultat = await promesse;
  if (!resultat.ok) throw new LectureRefusee(resultat.error, resultat.status);
  return resultat.data;
}

function Etat({ language, error }: { readonly language: AdminLanguage; readonly error: unknown }) {
  const online = useOnline();
  const refuse = error instanceof LectureRefusee && error.status === 403;
  const cle = refuse ? 'admin.dossier.restricted' : online ? 'admin.convList.unavailable' : 'admin.offline';
  return (
    <p className="text-caption" style={{ color: INK2 }} data-admin-absence>
      {translateAdmin(language, cle)}
    </p>
  );
}

function Vide({ language }: { readonly language: AdminLanguage }) {
  return (
    <p className="text-caption" style={{ color: INK2 }} data-admin-dossier-empty>
      {translateAdmin(language, 'admin.dossier.empty')}
    </p>
  );
}

/** Une liste paginée du dossier : squelette, absence, vide, tableau et pied. */
function Paginee<T>({
  language,
  query,
  offset,
  onOffset,
  entetes,
  ligne,
}: {
  readonly language: AdminLanguage;
  readonly query: { readonly isPending: boolean; readonly data: AdminDossierPage<T> | undefined; readonly error: unknown };
  readonly offset: number;
  readonly onOffset: (offset: number) => void;
  readonly entetes: readonly string[];
  readonly ligne: (row: T) => ReactNode;
}) {
  if (query.isPending) return <AdminSkeleton rows={3} />;
  if (query.data === undefined) return <Etat language={language} error={query.error} />;
  if (query.data.rows.length === 0) return <Vide language={language} />;
  return (
    <>
      <AdminTable>
        <thead>
          <tr>
            {entetes.map((entete) => (
              <PlainTh key={entete}>{entete}</PlainTh>
            ))}
          </tr>
        </thead>
        <tbody>{query.data.rows.map(ligne)}</tbody>
      </AdminTable>
      <AdminPager
        language={language}
        offset={offset}
        limit={ADMIN_DOSSIER_PAGE_SIZE}
        count={query.data.rows.length}
        total={query.data.total}
        hasMore={query.data.hasMore}
        pageSizes={[ADMIN_DOSSIER_PAGE_SIZE]}
        onPage={(demande) => onOffset(Math.max(0, demande.offset ?? 0))}
      />
    </>
  );
}

function Titre({ children }: { readonly children: ReactNode }) {
  return (
    <h2 className="pb-2 text-body font-semibold" style={{ color: 'var(--color-ios-ink)' }}>
      {children}
    </h2>
  );
}

type TabProps = { readonly userId: string; readonly language: AdminLanguage; readonly deps?: AdminDeps; readonly now?: () => Date };

const moment = (iso: string | null, now: Date, language: AdminLanguage) => <AdminMomentText moment={adminMomentOf(iso, now, language)} />;

export function AdminUserContactsTab({ userId, language, deps = apiDeps, now = () => new Date() }: TabProps) {
  const activite = useQuery({
    queryKey: adminUserActivityQueryKey(userId),
    queryFn: ({ signal }) => servi(loadAdminUserActivity({ ...deps, userId, signal })),
    retry: false,
  });

  if (activite.isPending) return <AdminSkeleton rows={4} />;
  if (activite.data === undefined) return <Etat language={language} error={activite.error} />;
  const { contacts, shareLinks, trackingLinks, affiliateTokens } = activite.data;
  const instant = now();

  return (
    <div className="grid gap-3" data-admin-contacts>
      <p className="text-caption" style={{ color: INK2 }}>
        {translateAdmin(language, 'admin.contacts.links', {
          share: String(shareLinks),
          tracking: String(trackingLinks),
          affiliate: String(affiliateTokens),
        })}
      </p>
      {contacts.length === 0 ? (
        <Vide language={language} />
      ) : (
        <AdminTable>
          <thead>
            <tr>
              <PlainTh>{translateAdmin(language, 'admin.col.member')}</PlainTh>
              <PlainTh>{translateAdmin(language, 'admin.contacts.direction')}</PlainTh>
              <PlainTh>{translateAdmin(language, 'admin.col.status')}</PlainTh>
              <PlainTh>{translateAdmin(language, 'admin.people.dossier.contactDate')}</PlainTh>
            </tr>
          </thead>
          <tbody>
            {contacts.map((contact) => (
              <tr key={contact.id} data-admin-contact={contact.id}>
                <Td>
                  <AdminEntityChip language={language} size="sm" entity={userEntityOf(contact.other, language, instant)} />
                </Td>
                <Td className="text-caption">
                  {translateAdmin(language, contact.direction === 'sent' ? 'admin.contacts.sent' : 'admin.contacts.received')}
                </Td>
                <Td className="text-caption">
                  <AdminInterpretedBadge value={interpretFriendStatus(contact.status, language)} />
                </Td>
                <Td className="whitespace-nowrap text-caption">{moment(contact.createdAt, instant, language)}</Td>
              </tr>
            ))}
          </tbody>
        </AdminTable>
      )}
    </div>
  );
}

export function AdminUserCommunitiesTab({ userId, language, deps = apiDeps }: TabProps) {
  const [offset, setOffset] = useState(0);
  const liste = useQuery({
    queryKey: adminUserCommunitiesQueryKey(userId, offset),
    queryFn: ({ signal }) => servi(loadAdminUserCommunities({ ...deps, userId, offset, signal })),
    retry: false,
  });

  return (
    <div data-admin-communities>
      <Paginee
        language={language}
        query={liste}
        offset={offset}
        onOffset={setOffset}
        entetes={[
          translateAdmin(language, 'admin.tab.communities'),
          translateAdmin(language, 'admin.col.role'),
          translateAdmin(language, 'admin.col.members'),
          translateAdmin(language, 'admin.col.status'),
          translateAdmin(language, 'admin.col.joined'),
        ]}
        ligne={(communaute) => <LigneCommunaute key={communaute.id} communaute={communaute} language={language} />}
      />
    </div>
  );
}

function LigneCommunaute({ communaute, language }: { readonly communaute: AdminCommunity; readonly language: AdminLanguage }) {
  return (
    <tr data-admin-community={communaute.id}>
      <Td>
        <AdminEntityChip
          language={language}
          size="sm"
          entity={{
            kind: 'community',
            id: communaute.id,
            label: communaute.name,
            secondary: communaute.isPrivate ? `${communaute.identifier} · ${translateAdmin(language, 'admin.communities.private')}` : communaute.identifier,
            avatarUrl: communaute.avatar === '' ? null : communaute.avatar,
          }}
        />
      </Td>
      <Td className="text-caption">
        <span className="inline-flex flex-wrap items-center gap-1">
          <AdminInterpretedBadge value={interpretParticipantRole(communaute.role, language)} />
          {communaute.isCreator ? <AdminBadge tone="brand">{translateAdmin(language, 'admin.communities.creator')}</AdminBadge> : null}
        </span>
      </Td>
      <Td className="text-caption tabular-nums">{formatCount(communaute.memberCount, language)}</Td>
      <Td className="text-caption">
        {communaute.isActive ? (
          <AdminInterpretedBadge value={interpretAccountState('active', language)} />
        ) : (
          <AdminBadge tone="neutral">{translateAdmin(language, 'admin.people.dossier.memberLeft')}</AdminBadge>
        )}
      </Td>
      <Td className="whitespace-nowrap text-caption">{adminDate(communaute.joinedAt, language)}</Td>
    </tr>
  );
}

export function AdminUserVoiceTab({ userId, language, deps = apiDeps }: TabProps) {
  const voix = useQuery({
    queryKey: adminUserVoiceQueryKey(userId),
    queryFn: ({ signal }) => servi(loadAdminUserVoice({ ...deps, userId, signal })),
    ...SOUVERAIN,
  });

  if (voix.isPending) return <AdminSkeleton rows={3} />;
  if (voix.data === undefined) return <Etat language={language} error={voix.error} />;
  const { profile, consents } = voix.data;
  const consentement = (valeur: string | null) =>
    valeur === null ? translateAdmin(language, 'admin.people.consent.notGiven') : translateAdmin(language, 'admin.people.consent.givenOn', { date: adminDate(valeur, language) });

  return (
    <div className="grid gap-5 lg:grid-cols-2" data-admin-voice>
      <AdminSection titre={translateAdmin(language, 'admin.tab.voice')}>
        {profile === null ? (
          <p className="text-caption" style={{ color: INK2 }}>
            {translateAdmin(language, 'admin.voice.none')}
          </p>
        ) : (
          <>
            <AdminLine label={translateAdmin(language, 'admin.voice.samples')} valeur={formatCount(profile.audioCount, language)} />
            <AdminLine label={translateAdmin(language, 'admin.voice.duration')} valeur={formatDuration(profile.totalDurationMs, 'ms', language)} />
            <AdminLine label={translateAdmin(language, 'admin.voice.model')} valeur={profile.model || '—'} />
            <AdminLine label={translateAdmin(language, 'admin.col.createdOn')} valeur={adminDate(profile.createdAt, language)} />
          </>
        )}
      </AdminSection>
      <AdminSection titre={translateAdmin(language, 'admin.voice.consents')}>
        <AdminLine label={translateAdmin(language, 'admin.voice.consentProfile')} valeur={consentement(consents.voiceProfile)} />
        <AdminLine label={translateAdmin(language, 'admin.voice.consentData')} valeur={consentement(consents.voiceData)} />
        <AdminLine label={translateAdmin(language, 'admin.voice.consentCloning')} valeur={consentement(consents.voiceCloning)} />
      </AdminSection>
      <p className="text-caption lg:col-span-2" style={{ color: INK2 }}>
        {translateAdmin(language, 'admin.voice.traced')}
      </p>
    </div>
  );
}

export function AdminUserSecurityTab({ userId, language, deps = apiDeps, now = () => new Date() }: TabProps) {
  const [offsetSessions, setOffsetSessions] = useState(0);
  const [offsetEvenements, setOffsetEvenements] = useState(0);
  const instant = now();
  const sessions = useQuery({
    queryKey: adminUserSessionsQueryKey(userId, offsetSessions),
    queryFn: ({ signal }) => servi(loadAdminUserSessions({ ...deps, userId, offset: offsetSessions, signal })),
    ...SOUVERAIN,
  });
  const evenements = useQuery({
    queryKey: adminUserSecurityQueryKey(userId, offsetEvenements),
    queryFn: ({ signal }) => servi(loadAdminUserSecurityEvents({ ...deps, userId, offset: offsetEvenements, signal })),
    ...SOUVERAIN,
  });

  return (
    <div className="grid gap-6" data-admin-security>
      <section>
        <Titre>{translateAdmin(language, 'admin.security.sessions')}</Titre>
        <Paginee
          language={language}
          query={sessions}
          offset={offsetSessions}
          onOffset={setOffsetSessions}
          entetes={[
            translateAdmin(language, 'admin.security.device'),
            translateAdmin(language, 'admin.security.place'),
            translateAdmin(language, 'admin.security.ip'),
            translateAdmin(language, 'admin.col.status'),
            translateAdmin(language, 'admin.col.lastActive'),
          ]}
          ligne={(session) => (
            <tr key={session.id}>
              <Td className="max-w-[18rem] break-words text-caption">{session.device}</Td>
              <Td className="text-caption">{session.place || '—'}</Td>
              <Td className="text-caption tabular-nums">{session.ipAddress || '—'}</Td>
              <Td className="text-caption">
                {session.isValid ? (
                  <AdminBadge tone="success">{translateAdmin(language, 'admin.security.valid')}</AdminBadge>
                ) : (
                  <AdminBadge tone="neutral">{translateAdmin(language, 'admin.security.closed')}</AdminBadge>
                )}
              </Td>
              <Td className="whitespace-nowrap text-caption">{moment(session.lastActivityAt ?? session.createdAt, instant, language)}</Td>
            </tr>
          )}
        />
      </section>
      <section>
        <Titre>{translateAdmin(language, 'admin.security.events')}</Titre>
        <Paginee
          language={language}
          query={evenements}
          offset={offsetEvenements}
          onOffset={setOffsetEvenements}
          entetes={[
            translateAdmin(language, 'admin.security.event'),
            translateAdmin(language, 'admin.security.severity'),
            translateAdmin(language, 'admin.people.dossier.eventStatus'),
            translateAdmin(language, 'admin.security.ip'),
            translateAdmin(language, 'admin.col.date'),
          ]}
          ligne={(evenement) => (
            <tr key={evenement.id}>
              <Td>
                <span className="block text-caption font-medium">{securityEventLabel(evenement.eventType, language)}</span>
                {evenement.description === '' ? null : (
                  <span className="block max-w-[24rem] break-words text-caption" style={{ color: INK2 }}>
                    {evenement.description}
                  </span>
                )}
              </Td>
              <Td className="text-caption">
                <AdminInterpretedBadge value={interpretSeverity(evenement.severity, language)} />
              </Td>
              <Td className="text-caption">
                <AdminInterpretedBadge value={interpretSecurityStatus(evenement.status, language)} />
              </Td>
              <Td className="text-caption tabular-nums">{evenement.ipAddress || '—'}</Td>
              <Td className="whitespace-nowrap text-caption">{moment(evenement.createdAt, instant, language)}</Td>
            </tr>
          )}
        />
      </section>
    </div>
  );
}

function LigneSignalement({
  report,
  language,
  recu,
  now,
}: {
  readonly report: AdminReport;
  readonly language: AdminLanguage;
  readonly recu: boolean;
  readonly now: Date;
}) {
  return (
    <tr>
      {/* Un signalement REÇU nomme son auteur (texte servi) ; un signalement FAIT dit le genre de ce qu'il vise. */}
      <Td className="text-caption">
        {recu ? report.subject || '—' : report.subject === '' ? '—' : interpretReportedEntity(report.subject, language).label}
      </Td>
      <Td className="text-caption">{interpretReportType(report.reportType, language).label}</Td>
      <Td className="max-w-[18rem] break-words text-caption">{report.reason || '—'}</Td>
      {recu ? (
        <Td className="max-w-[20rem] break-words text-caption">
          {report.excerpt ?? <span style={{ color: INK2 }}>{translateAdmin(language, 'admin.reports.withheld')}</span>}
        </Td>
      ) : null}
      <Td className="text-caption">
        <AdminInterpretedBadge value={interpretReportStatus(report.status, language)} />
      </Td>
      <Td className="whitespace-nowrap text-caption">{moment(report.createdAt, now, language)}</Td>
    </tr>
  );
}

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
  const colonnes = (recu: boolean) => [
    translateAdmin(language, recu ? 'admin.reports.reporter' : 'admin.reports.subject'),
    translateAdmin(language, 'admin.col.type'),
    translateAdmin(language, 'admin.reports.reason'),
    ...(recu ? [translateAdmin(language, 'admin.reports.message')] : []),
    translateAdmin(language, 'admin.col.status'),
    translateAdmin(language, 'admin.col.date'),
  ];

  return (
    <div className="grid gap-6" data-admin-reports>
      <section>
        <Titre>{translateAdmin(language, 'admin.reports.received')}</Titre>
        <Paginee
          language={language}
          query={recus}
          offset={offsetRecus}
          onOffset={setOffsetRecus}
          entetes={colonnes(true)}
          ligne={(report) => <LigneSignalement key={report.id} report={report} language={language} recu now={instant} />}
        />
      </section>
      <section>
        <Titre>{translateAdmin(language, 'admin.reports.filed')}</Titre>
        <Paginee
          language={language}
          query={faits}
          offset={offsetFaits}
          onOffset={setOffsetFaits}
          entetes={colonnes(false)}
          ligne={(report) => <LigneSignalement key={report.id} report={report} language={language} recu={false} now={instant} />}
        />
      </section>
    </div>
  );
}
