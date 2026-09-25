import { useQuery } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';

import { Avatar } from '@/components/avatar';
import {
  ADMIN_DOSSIER_PAGE_SIZE,
  adminUserCommunitiesQueryKey,
  adminUserVoiceQueryKey,
  loadAdminUserCommunities,
  loadAdminUserVoice,
  type AdminDossierPage,
  type AdminCommunity,
} from '@/lib/api/admin-user-dossier';
import type { AdminDeps } from '@/lib/api/admin';
import { apiDeps } from '@/lib/api/deps';
import type { ApiResult } from '@/lib/api/http';
import { adminMoment } from '@/lib/admin/format';
import { translateAdmin } from '@/lib/i18n-admin-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';
import { useOnline } from '@/lib/net/online';
import { initialsOf, participantAvatarOf } from '@/lib/view/conversation';

import { AdminLine, AdminSection, AdminSkeleton } from './admin-parts';
import { AdminPager, AdminTable, PlainTh, Td } from './admin-table';

/**
 * **LE DOSSIER D'UN MEMBRE : SES COMMUNAUTÉS ET SA VOIX** (#7845, #7873).
 * Contacts, sécurité et signalements ont leurs propres panneaux
 * (`admin-user-activity.tsx`, `admin-user-security.tsx`) — une seule
 * implémentation par onglet.
 *
 * Chaque onglet ne lit sa route qu'à son OUVERTURE : la fiche ne frappe pas
 * neuf adresses pour en montrer une, et la consultation du profil vocal — que
 * la passerelle trace — n'est journalisée que si on l'a vraiment regardé.
 *
 * Un échec se DIT (#6862) : hors ligne on nomme la coupure, en ligne la
 * passerelle ; un 403 dit que la section est réservée. Un
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

function Statut({ ton, children }: { readonly ton: 'ok' | 'ko' | 'neutre'; readonly children: ReactNode }) {
  const couleur = ton === 'ok' ? 'var(--color-success, #34D399)' : ton === 'ko' ? 'var(--color-danger)' : INK2;
  return <span style={{ color: couleur }}>{children}</span>;
}

export function AdminUserCommunitiesTab({
  userId,
  language,
  deps = apiDeps,
}: {
  readonly userId: string;
  readonly language: InterfaceLanguage;
  readonly deps?: AdminDeps;
}) {
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

export function AdminUserVoiceTab({
  userId,
  language,
  deps = apiDeps,
}: {
  readonly userId: string;
  readonly language: InterfaceLanguage;
  readonly deps?: AdminDeps;
}) {
  const voix = useQuery({
    queryKey: adminUserVoiceQueryKey(userId),
    queryFn: ({ signal }) => servi(loadAdminUserVoice({ ...deps, userId, signal })),
    ...SOUVERAIN,
  });

  if (voix.isPending) return <AdminSkeleton rows={3} />;
  if (voix.data === undefined) return <Etat language={language} error={voix.error} />;
  const { profile, consents } = voix.data;
  const consentement = (valeur: string | null) => (valeur === null ? translateAdmin(language, 'admin.voice.notGiven') : adminMoment(valeur, language));

  return (
    <div className="grid gap-5 xl:grid-cols-2" data-admin-voice>
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
      <p className="text-caption xl:col-span-2" style={{ color: INK2 }}>
        {translateAdmin(language, 'admin.voice.traced')}
      </p>
    </div>
  );
}
