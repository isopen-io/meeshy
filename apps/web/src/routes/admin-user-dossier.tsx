import { useQuery } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';

import { Avatar } from '@/components/avatar';
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
import { adminMoment } from '@/lib/admin/format';
import { translateAdmin } from '@/lib/i18n-admin-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';
import { useOnline } from '@/lib/net/online';
import { initialsOf, participantAvatarOf } from '@/lib/view/conversation';

import { AdminLine, AdminSection, AdminSkeleton } from './admin-parts';
import { AdminPager, AdminTable, PlainTh, Td } from './admin-table';
import { Link } from './route-table';


/**
 * **LE DOSSIER D'UN MEMBRE, ONGLET PAR ONGLET** (#7845, #7873) — contacts,
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

function Etat({ language, error }: { readonly language: InterfaceLanguage; readonly error: unknown }) {
  const online = useOnline();
  const refuse = error instanceof LectureRefusee && error.status === 403;
  const cle = refuse ? 'admin.dossier.restricted' : online ? 'admin.convList.unavailable' : 'admin.offline';
  return (
    <p className="text-caption" style={{ color: INK2 }} data-admin-absence>
      {translateAdmin(language, cle)}
    </p>
  );
}

function Vide({ language }: { readonly language: InterfaceLanguage }) {
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
  readonly language: InterfaceLanguage;
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

function Statut({ ton, children }: { readonly ton: 'ok' | 'ko' | 'neutre'; readonly children: ReactNode }) {
  const couleur = ton === 'ok' ? 'var(--color-success, #34D399)' : ton === 'ko' ? 'var(--color-danger)' : INK2;
  return <span style={{ color: couleur }}>{children}</span>;
}

export function AdminUserContactsTab({
  userId,
  language,
  cible,
}: {
  readonly userId: string;
  readonly language: InterfaceLanguage;
  readonly cible: 'adminUser' | 'admUser';
}) {
  const activite = useQuery({
    queryKey: adminUserActivityQueryKey(userId),
    queryFn: ({ signal }) => servi(loadAdminUserActivity({ ...apiDeps, userId, signal })),
    retry: false,
  });

  if (activite.isPending) return <AdminSkeleton rows={4} />;
  if (activite.data === undefined) return <Etat language={language} error={activite.error} />;
  const { contacts, shareLinks, trackingLinks, affiliateTokens } = activite.data;

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
              <PlainTh>{translateAdmin(language, 'admin.col.date')}</PlainTh>
            </tr>
          </thead>
          <tbody>
            {contacts.map((contact) => {
              const photo = participantAvatarOf({ avatar: contact.other.avatar });
              return (
                <tr key={contact.id} data-admin-contact={contact.id}>
                  <Td>
                    <Link to={cible} params={{ user: contact.other.id }} className="flex min-w-0 items-center gap-3" style={{ minHeight: 44 }}>
                      <Avatar
                        initials={initialsOf(contact.other.displayName)}
                        color="var(--color-ios-brand)"
                        size={32}
                        name={contact.other.displayName}
                        {...(photo === undefined ? {} : { src: photo })}
                      />
                      <span className="min-w-0">
                        <span className="block truncate font-medium">{contact.other.displayName}</span>
                        <span className="block truncate text-caption" style={{ color: INK2 }}>
                          @{contact.other.username}
                        </span>
                      </span>
                    </Link>
                  </Td>
                  <Td className="text-caption">
                    {translateAdmin(language, contact.direction === 'sent' ? 'admin.contacts.sent' : 'admin.contacts.received')}
                  </Td>
                  <Td className="text-caption">
                    <Statut ton={contact.status === 'accepted' ? 'ok' : contact.status === 'pending' ? 'neutre' : 'ko'}>{contact.status}</Statut>
                  </Td>
                  <Td className="whitespace-nowrap text-caption tabular-nums">{adminMoment(contact.createdAt, language)}</Td>
                </tr>
              );
            })}
          </tbody>
        </AdminTable>
      )}
    </div>
  );
}

export function AdminUserCommunitiesTab({ userId, language }: { readonly userId: string; readonly language: InterfaceLanguage }) {
  const [offset, setOffset] = useState(0);
  const liste = useQuery({
    queryKey: adminUserCommunitiesQueryKey(userId, offset),
    queryFn: ({ signal }) => servi(loadAdminUserCommunities({ ...apiDeps, userId, offset, signal })),
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

function LigneCommunaute({ communaute, language }: { readonly communaute: AdminCommunity; readonly language: InterfaceLanguage }) {
  const photo = participantAvatarOf({ avatar: communaute.avatar });
  return (
    <tr data-admin-community={communaute.id}>
      <Td>
        <span className="flex min-w-0 items-center gap-3">
          <Avatar
            initials={initialsOf(communaute.name)}
            color="var(--color-ios-brand)"
            size={32}
            name={communaute.name}
            {...(photo === undefined ? {} : { src: photo })}
          />
          <span className="min-w-0">
            <span className="block truncate font-medium">{communaute.name}</span>
            <span className="block truncate text-caption" style={{ color: INK2 }}>
              {communaute.identifier}
              {communaute.isPrivate ? ` · ${translateAdmin(language, 'admin.communities.private')}` : ''}
            </span>
          </span>
        </span>
      </Td>
      <Td className="text-caption">
        {communaute.role}
        {communaute.isCreator ? ` · ${translateAdmin(language, 'admin.communities.creator')}` : ''}
      </Td>
      <Td className="text-caption tabular-nums">{communaute.memberCount}</Td>
      <Td className="text-caption">
        {communaute.isActive ? (
          <Statut ton="ok">{translateAdmin(language, 'admin.filter.active')}</Statut>
        ) : (
          <Statut ton="neutre">{translateAdmin(language, 'admin.anonymous.left')}</Statut>
        )}
      </Td>
      <Td className="whitespace-nowrap text-caption tabular-nums">{adminMoment(communaute.joinedAt, language)}</Td>
    </tr>
  );
}

const duree = (ms: number): string => {
  const secondes = Math.round(ms / 1000);
  return `${Math.floor(secondes / 60)}:${String(secondes % 60).padStart(2, '0')}`;
};

export function AdminUserVoiceTab({ userId, language }: { readonly userId: string; readonly language: InterfaceLanguage }) {
  const voix = useQuery({
    queryKey: adminUserVoiceQueryKey(userId),
    queryFn: ({ signal }) => servi(loadAdminUserVoice({ ...apiDeps, userId, signal })),
    ...SOUVERAIN,
  });

  if (voix.isPending) return <AdminSkeleton rows={3} />;
  if (voix.data === undefined) return <Etat language={language} error={voix.error} />;
  const { profile, consents } = voix.data;
  const consentement = (valeur: string | null) => (valeur === null ? translateAdmin(language, 'admin.voice.notGiven') : adminMoment(valeur, language));

  return (
    <div className="grid gap-5 lg:grid-cols-2" data-admin-voice>
      <AdminSection titre={translateAdmin(language, 'admin.tab.voice')}>
        {profile === null ? (
          <p className="text-caption" style={{ color: INK2 }}>
            {translateAdmin(language, 'admin.voice.none')}
          </p>
        ) : (
          <>
            <AdminLine label={translateAdmin(language, 'admin.voice.samples')} valeur={String(profile.audioCount)} />
            <AdminLine label={translateAdmin(language, 'admin.voice.duration')} valeur={duree(profile.totalDurationMs)} />
            <AdminLine label={translateAdmin(language, 'admin.voice.model')} valeur={profile.model || '—'} />
            <AdminLine label={translateAdmin(language, 'admin.col.createdOn')} valeur={adminMoment(profile.createdAt, language)} />
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

export function AdminUserSecurityTab({ userId, language }: { readonly userId: string; readonly language: InterfaceLanguage }) {
  const [offsetSessions, setOffsetSessions] = useState(0);
  const [offsetEvenements, setOffsetEvenements] = useState(0);
  const sessions = useQuery({
    queryKey: adminUserSessionsQueryKey(userId, offsetSessions),
    queryFn: ({ signal }) => servi(loadAdminUserSessions({ ...apiDeps, userId, offset: offsetSessions, signal })),
    ...SOUVERAIN,
  });
  const evenements = useQuery({
    queryKey: adminUserSecurityQueryKey(userId, offsetEvenements),
    queryFn: ({ signal }) => servi(loadAdminUserSecurityEvents({ ...apiDeps, userId, offset: offsetEvenements, signal })),
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
              <Td className="max-w-[18rem] truncate text-caption">{session.device}</Td>
              <Td className="text-caption">{session.place || '—'}</Td>
              <Td className="text-caption tabular-nums">{session.ipAddress || '—'}</Td>
              <Td className="text-caption">
                <Statut ton={session.isValid ? 'ok' : 'neutre'}>
                  {translateAdmin(language, session.isValid ? 'admin.security.valid' : 'admin.security.closed')}
                </Statut>
              </Td>
              <Td className="whitespace-nowrap text-caption tabular-nums">{adminMoment(session.lastActivityAt ?? session.createdAt, language)}</Td>
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
            translateAdmin(language, 'admin.security.ip'),
            translateAdmin(language, 'admin.col.date'),
          ]}
          ligne={(evenement) => (
            <tr key={evenement.id}>
              <Td>
                <span className="block text-caption font-medium">{evenement.eventType}</span>
                {evenement.description === '' ? null : (
                  <span className="block max-w-[24rem] truncate text-caption" style={{ color: INK2 }}>
                    {evenement.description}
                  </span>
                )}
              </Td>
              <Td className="text-caption">
                <Statut ton={/high|critical/i.test(evenement.severity) ? 'ko' : 'neutre'}>{evenement.severity || '—'}</Statut>
              </Td>
              <Td className="text-caption tabular-nums">{evenement.ipAddress || '—'}</Td>
              <Td className="whitespace-nowrap text-caption tabular-nums">{adminMoment(evenement.createdAt, language)}</Td>
            </tr>
          )}
        />
      </section>
    </div>
  );
}

function LigneSignalement({ report, language, recu }: { readonly report: AdminReport; readonly language: InterfaceLanguage; readonly recu: boolean }) {
  return (
    <tr>
      <Td className="text-caption">{report.subject || '—'}</Td>
      <Td className="text-caption">{report.reportType || '—'}</Td>
      <Td className="max-w-[18rem] truncate text-caption">{report.reason || '—'}</Td>
      {recu ? (
        <Td className="max-w-[20rem] truncate text-caption">
          {report.excerpt ?? <span style={{ color: INK2 }}>{translateAdmin(language, 'admin.reports.withheld')}</span>}
        </Td>
      ) : null}
      <Td className="text-caption">{report.status || '—'}</Td>
      <Td className="whitespace-nowrap text-caption tabular-nums">{adminMoment(report.createdAt, language)}</Td>
    </tr>
  );
}

export function AdminUserReportsTab({ userId, language }: { readonly userId: string; readonly language: InterfaceLanguage }) {
  const [offsetFaits, setOffsetFaits] = useState(0);
  const [offsetRecus, setOffsetRecus] = useState(0);
  const faits = useQuery({
    queryKey: adminUserReportsFiledQueryKey(userId, offsetFaits),
    queryFn: ({ signal }) => servi(loadAdminUserReportsFiled({ ...apiDeps, userId, offset: offsetFaits, signal })),
    retry: false,
  });
  const recus = useQuery({
    queryKey: adminUserReportsReceivedQueryKey(userId, offsetRecus),
    queryFn: ({ signal }) => servi(loadAdminUserReportsReceived({ ...apiDeps, userId, offset: offsetRecus, signal })),
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
          ligne={(report) => <LigneSignalement key={report.id} report={report} language={language} recu />}
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
          ligne={(report) => <LigneSignalement key={report.id} report={report} language={language} recu={false} />}
        />
      </section>
    </div>
  );
}
