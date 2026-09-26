import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { CollapsibleSection } from '@/components/collapsible-section';
import type { AdminDeps } from '@/lib/api/admin';
import {
  ADMIN_PREFERENCE_CATEGORIES,
  ADMIN_READ_ONLY_PREFERENCES,
  ADMIN_STAT_KEYS,
  adminUserPreferencesQueryKey,
  adminUserStatsQueryKey,
  loadAdminUserPreferences,
  loadAdminUserStats,
  patchAdminUserPreferences,
  type AdminPreferenceCategory,
  type AdminPreferenceDocument,
  type AdminPreferenceValue,
  type AdminStatKey,
  type AdminUserPreferences,
} from '@/lib/api/admin-user-member';
import { apiDeps } from '@/lib/api/deps';
import type { ApiFailure } from '@/lib/api/http';
import { translateAdmin } from '@/lib/i18n-admin-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';

import { AdminSection, AdminSkeleton } from './admin-parts';

/**
 * **LES CHIFFRES ET LES PRÉFÉRENCES D'UN MEMBRE** (#7845).
 *
 * Les chiffres vivent sur l'onglet Profil ; les préférences ont leur onglet,
 * catégorie par catégorie, chaque valeur modifiable par le contrôle qui lui
 * ressemble (bascule, liste, nombre, texte). Une écriture s'applique TOUT DE
 * SUITE à l'écran et revient en arrière si la passerelle la refuse — avec le
 * motif du refus : consentement du membre manquant, rang insuffisant, valeur
 * invalide. Les trois clés de chiffrement se lisent sans s'écrire.
 */
const INK = 'var(--color-ios-ink)';
const INK2 = 'var(--color-ios-ink-2)';
const CARTE = { backgroundColor: 'var(--color-ios-surface)', border: '1px solid var(--color-edge)' } as const;

const LIBELLES_CHIFFRES = {
  messagesSent: 'admin.stats.messagesSent',
  conversations: 'admin.stats.conversations',
  posts: 'admin.stats.posts',
  reels: 'admin.stats.reels',
  stories: 'admin.stats.stories',
  comments: 'admin.stats.comments',
  reactionsGiven: 'admin.stats.reactionsGiven',
  mediaUploaded: 'admin.stats.mediaUploaded',
  friends: 'admin.stats.friends',
  pendingFriendRequestsIn: 'admin.stats.pendingIn',
  pendingFriendRequestsOut: 'admin.stats.pendingOut',
  reportsFiled: 'admin.stats.reportsFiled',
  reportsReceived: 'admin.stats.reportsReceived',
  activeSessions: 'admin.stats.activeSessions',
  communities: 'admin.stats.communities',
} as const satisfies Readonly<Record<AdminStatKey, string>>;

const LIBELLES_CATEGORIES = {
  privacy: 'admin.prefs.privacy',
  notification: 'admin.prefs.notification',
  message: 'admin.prefs.message',
  audio: 'admin.prefs.audio',
  video: 'admin.prefs.video',
  document: 'admin.prefs.document',
  application: 'admin.prefs.application',
} as const satisfies Readonly<Record<AdminPreferenceCategory, string>>;

/** Les valeurs admises des clés à liste fermée, telles que les schémas de la passerelle les déclarent. */
const LISTES: Readonly<Record<string, readonly string[]>> = {
  'privacy.encryptionPreference': ['disabled', 'optional', 'always'],
  'message.defaultFontSize': ['small', 'medium', 'large'],
  'message.defaultTextAlign': ['left', 'center', 'right'],
  'audio.transcriptionSource': ['auto', 'mobile', 'server'],
  'audio.translatedAudioFormat': ['mp3', 'wav', 'ogg'],
  'audio.audioQuality': ['low', 'medium', 'high', 'lossless'],
  'audio.voiceCloneQuality': ['fast', 'balanced', 'quality'],
  'video.videoQuality': ['low', 'medium', 'high', 'auto'],
  'video.videoFrameRate': ['15', '24', '30', '60'],
  'video.videoResolution': ['480p', '720p', '1080p', 'auto'],
  'video.videoCodec': ['VP8', 'VP9', 'H264', 'H265', 'AV1'],
  'video.videoLayout': ['grid', 'speaker', 'sidebar'],
  'application.theme': ['light', 'dark', 'auto'],
  'application.fontSize': ['small', 'medium', 'large'],
  'application.lineHeight': ['tight', 'normal', 'relaxed', 'loose'],
  'application.sidebarPosition': ['left', 'right'],
};

export function AdminUserStatsSection({
  userId,
  language,
  deps = apiDeps,
}: {
  readonly userId: string;
  readonly language: InterfaceLanguage;
  readonly deps?: AdminDeps;
}) {
  const chiffres = useQuery({
    queryKey: adminUserStatsQueryKey(userId),
    queryFn: async ({ signal }) => {
      const resultat = await loadAdminUserStats({ ...deps, userId, signal });
      if (!resultat.ok) throw new Error(resultat.error);
      return resultat.data;
    },
    retry: false,
  });
  return (
    <AdminSection titre={translateAdmin(language, 'admin.stats.title')}>
      {chiffres.isPending ? (
        <AdminSkeleton rows={2} />
      ) : chiffres.data === undefined ? (
        <p className="text-caption" style={{ color: INK2 }}>
          {translateAdmin(language, 'admin.users.unavailable')}
        </p>
      ) : (
        <dl className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-5" data-admin-stats="">
          {ADMIN_STAT_KEYS.filter((cle) => chiffres.data[cle] !== null).map((cle) => (
            <div key={cle} className="rounded-card px-3 py-2" style={CARTE} data-admin-stat={cle}>
              <dt className="truncate text-caption" style={{ color: INK2 }}>
                {translateAdmin(language, LIBELLES_CHIFFRES[cle])}
              </dt>
              <dd className="m-0 text-title font-semibold tabular-nums" style={{ color: INK }}>
                {(chiffres.data[cle] ?? 0).toLocaleString(language)}
              </dd>
            </div>
          ))}
        </dl>
      )}
    </AdminSection>
  );
}

const motifDuRefus = (echec: ApiFailure, language: InterfaceLanguage): string => {
  if (echec.code === 'CONSENT_REQUIRED') return translateAdmin(language, 'admin.prefs.consent');
  if (echec.status === 403) return translateAdmin(language, 'admin.prefs.reserved');
  if (echec.status === 400) return translateAdmin(language, 'admin.prefs.invalid');
  return translateAdmin(language, 'admin.prefs.failed');
};

class RefusEcriture extends Error {
  constructor(readonly echec: ApiFailure) {
    super(echec.error);
  }
}

export function AdminUserPreferencesTab({
  userId,
  language,
  onAnnounce,
  deps = apiDeps,
}: {
  readonly userId: string;
  readonly language: InterfaceLanguage;
  readonly onAnnounce: (texte: string) => void;
  readonly deps?: AdminDeps;
}) {
  const client = useQueryClient();
  const cle = adminUserPreferencesQueryKey(userId);
  const [refus, setRefus] = useState<string | null>(null);

  const preferences = useQuery({
    queryKey: cle,
    queryFn: async ({ signal }) => {
      const resultat = await loadAdminUserPreferences({ ...deps, userId, signal });
      if (!resultat.ok) throw new Error(resultat.error);
      return resultat.data;
    },
    retry: false,
  });

  const ecriture = useMutation({
    mutationFn: async (demande: { readonly category: AdminPreferenceCategory; readonly changes: AdminPreferenceDocument }) => {
      const resultat = await patchAdminUserPreferences({ ...deps, userId, ...demande });
      if (!resultat.ok) throw new RefusEcriture(resultat);
      return resultat.data;
    },
    onMutate: (demande) => {
      setRefus(null);
      const avant = client.getQueryData<AdminUserPreferences>(cle);
      if (avant !== undefined) {
        client.setQueryData<AdminUserPreferences>(cle, { ...avant, [demande.category]: { ...avant[demande.category], ...demande.changes } });
      }
      return { avant };
    },
    onError: (erreur, _demande, contexte) => {
      if (contexte?.avant !== undefined) client.setQueryData(cle, contexte.avant);
      const motif = erreur instanceof RefusEcriture ? motifDuRefus(erreur.echec, language) : translateAdmin(language, 'admin.prefs.failed');
      setRefus(motif);
      onAnnounce(motif);
    },
    onSuccess: (document, demande) => {
      const courant = client.getQueryData<AdminUserPreferences>(cle);
      if (courant !== undefined && Object.keys(document).length > 0) client.setQueryData(cle, { ...courant, [demande.category]: document });
      onAnnounce(translateAdmin(language, 'admin.prefs.saved'));
    },
  });

  if (preferences.isPending) return <AdminSkeleton rows={6} />;
  if (preferences.data === undefined) {
    return (
      <p className="text-caption" style={{ color: INK2 }}>
        {translateAdmin(language, 'admin.users.unavailable')}
      </p>
    );
  }
  const donnees = preferences.data;

  return (
    <div className="grid gap-4" data-admin-preferences="">
      <p className="text-caption" style={{ color: INK2 }}>
        {translateAdmin(language, 'admin.prefs.notice')}
      </p>
      {refus === null ? null : (
        <p role="alert" className="text-caption" style={{ color: 'var(--color-danger)' }} data-admin-preferences-error="">
          {refus}
        </p>
      )}
      {ADMIN_PREFERENCE_CATEGORIES.map((categorie) => (
        <CollapsibleSection key={categorie} id={`admin-prefs-${categorie}`} title={translateAdmin(language, LIBELLES_CATEGORIES[categorie])} defaultOpen={categorie === 'privacy'}>
          <ul className="grid gap-1" data-admin-preferences-category={categorie}>
            {Object.entries(donnees[categorie])
              .filter(([cleValeur]) => cleValeur !== 'extras')
              .map(([cleValeur, valeur]) => (
                <LignePreference
                  key={cleValeur}
                  categorie={categorie}
                  cle={cleValeur}
                  valeur={valeur}
                  language={language}
                  onChange={(suivante) => ecriture.mutate({ category: categorie, changes: { [cleValeur]: suivante } })}
                />
              ))}
          </ul>
        </CollapsibleSection>
      ))}
    </div>
  );
}

function LignePreference({
  categorie,
  cle,
  valeur,
  language,
  onChange,
}: {
  readonly categorie: AdminPreferenceCategory;
  readonly cle: string;
  readonly valeur: AdminPreferenceValue;
  readonly language: InterfaceLanguage;
  readonly onChange: (valeur: AdminPreferenceValue) => void;
}) {
  const lectureSeule = (ADMIN_READ_ONLY_PREFERENCES[categorie] ?? []).includes(cle);
  const idControle = `admin-pref-${categorie}-${cle}`;
  return (
    <li className="flex min-h-11 items-center justify-between gap-3 py-1" data-admin-preference={`${categorie}.${cle}`}>
      <label htmlFor={idControle} className="min-w-0 flex-1 truncate font-mono text-caption" style={{ color: INK }}>
        {cle}
        {lectureSeule ? (
          <span className="ms-2 font-sans" style={{ color: INK2 }}>
            · {translateAdmin(language, 'admin.prefs.readOnly')}
          </span>
        ) : null}
      </label>
      <Controle id={idControle} chemin={`${categorie}.${cle}`} valeur={valeur} desactive={lectureSeule} onChange={onChange} />
    </li>
  );
}

function Controle({
  id,
  chemin,
  valeur,
  desactive,
  onChange,
}: {
  readonly id: string;
  readonly chemin: string;
  readonly valeur: AdminPreferenceValue;
  readonly desactive: boolean;
  readonly onChange: (valeur: AdminPreferenceValue) => void;
}) {
  if (typeof valeur === 'boolean') {
    return (
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={valeur}
        disabled={desactive}
        data-admin-preference-switch={chemin}
        onClick={() => onChange(!valeur)}
        className="relative h-7 w-12 shrink-0 rounded-full transition-colors disabled:opacity-50"
        style={{ backgroundColor: valeur ? 'var(--color-ios-brand)' : 'color-mix(in srgb, var(--color-ios-ink-3) 35%, transparent)' }}
      >
        <span
          aria-hidden="true"
          className="absolute top-0.5 size-6 rounded-full bg-white transition-all"
          style={{ insetInlineStart: valeur ? 'calc(100% - 1.625rem)' : '0.125rem' }}
        />
      </button>
    );
  }
  const liste = LISTES[chemin];
  if (liste !== undefined && typeof valeur === 'string') {
    return (
      <select
        id={id}
        value={valeur}
        disabled={desactive}
        data-admin-preference-select={chemin}
        onChange={(event) => onChange(event.currentTarget.value)}
        className="min-h-11 shrink-0 rounded-chip px-2 text-caption"
        style={CARTE}
      >
        {liste.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    );
  }
  if (typeof valeur === 'number' || typeof valeur === 'string') {
    return <ChampLibre key={String(valeur)} id={id} chemin={chemin} valeur={valeur} desactive={desactive} onChange={onChange} />;
  }
  return (
    <code className="max-w-[50%] truncate text-caption" style={{ color: INK2 }}>
      {JSON.stringify(valeur)}
    </code>
  );
}

/** Un nombre ou un texte s'écrit à la VALIDATION (Entrée ou sortie du champ), jamais à chaque frappe. */
function ChampLibre({
  id,
  chemin,
  valeur,
  desactive,
  onChange,
}: {
  readonly id: string;
  readonly chemin: string;
  readonly valeur: number | string;
  readonly desactive: boolean;
  readonly onChange: (valeur: AdminPreferenceValue) => void;
}) {
  const [brouillon, setBrouillon] = useState(String(valeur));
  const valider = () => {
    if (brouillon === String(valeur)) return;
    if (typeof valeur === 'number') {
      const nombre = Number(brouillon);
      if (brouillon.trim() === '' || !Number.isFinite(nombre)) {
        setBrouillon(String(valeur));
        return;
      }
      onChange(nombre);
      return;
    }
    onChange(brouillon);
  };
  return (
    <input
      id={id}
      type={typeof valeur === 'number' ? 'number' : 'text'}
      step="any"
      value={brouillon}
      disabled={desactive}
      data-admin-preference-input={chemin}
      onInput={(event) => setBrouillon(event.currentTarget.value)}
      onBlur={valider}
      onKeyDown={(event) => {
        if (event.key === 'Enter') valider();
      }}
      className="min-h-11 w-32 shrink-0 rounded-chip px-2 text-caption tabular-nums"
      style={CARTE}
    />
  );
}
