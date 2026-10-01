import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { CollapsibleSection } from '@/components/collapsible-section';
import { interpretPreferenceValue, preferenceLabel, preferenceOptions } from '@/lib/admin/preference-labels';
import type { AdminDeps } from '@/lib/api/admin';
import {
  ADMIN_PREFERENCE_CATEGORIES,
  ADMIN_READ_ONLY_PREFERENCES,
  adminUserPreferencesQueryKey,
  loadAdminUserPreferences,
  patchAdminUserPreferences,
  type AdminPreferenceCategory,
  type AdminPreferenceDocument,
  type AdminPreferenceValue,
  type AdminUserPreferences,
} from '@/lib/api/admin-user-member';
import { apiDeps } from '@/lib/api/deps';
import type { ApiFailure } from '@/lib/api/http';
import { translateAdmin, type AdminLanguage } from '@/lib/i18n-admin-catalog';

import { AdminSkeleton } from './admin-parts';

/**
 * **LES PRÉFÉRENCES D'UN MEMBRE** (#7845, #7920) — l'onglet, catégorie par
 * catégorie. Chaque clé porte son LIBELLÉ traduit (`lib/admin/preference-labels.ts`)
 * et sa valeur se DIT en mots sous ce libellé — Activé, Facultatif, ×1,5, 30 jours,
 * 22:00, anglais — ; le contrôle qui la modifie lui ressemble (bascule, liste aux
 * options NOMMÉES, nombre, texte).
 *
 * Une écriture s'applique TOUT DE SUITE à l'écran et revient en arrière si la
 * passerelle la refuse — avec le motif du refus : consentement du membre manquant,
 * rang insuffisant, valeur invalide. Les trois clés de chiffrement se lisent sans
 * s'écrire. Le nom d'une clé (`showReadReceipts`) n'est jamais lu à l'écran : il ne
 * vit que dans l'ancre de test `data-admin-preference`.
 */
const INK = 'var(--color-ios-ink)';
const INK2 = 'var(--color-ios-ink-2)';
const CARTE = { backgroundColor: 'var(--color-ios-surface)', border: '1px solid var(--color-edge)' } as const;

const LIBELLES_CATEGORIES = {
  privacy: 'admin.prefs.privacy',
  notification: 'admin.prefs.notification',
  message: 'admin.prefs.message',
  audio: 'admin.prefs.audio',
  video: 'admin.prefs.video',
  document: 'admin.prefs.document',
  application: 'admin.prefs.application',
} as const satisfies Readonly<Record<AdminPreferenceCategory, string>>;

const motifDuRefus = (echec: ApiFailure, language: AdminLanguage): string => {
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
  readonly language: AdminLanguage;
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
  readonly language: AdminLanguage;
  readonly onChange: (valeur: AdminPreferenceValue) => void;
}) {
  const lectureSeule = (ADMIN_READ_ONLY_PREFERENCES[categorie] ?? []).includes(cle);
  const idControle = `admin-pref-${categorie}-${cle}`;
  return (
    <li className="flex min-h-11 items-center justify-between gap-3 py-1" data-admin-preference={`${categorie}.${cle}`}>
      <div className="min-w-0 flex-1">
        <label htmlFor={idControle} className="block break-words text-body" style={{ color: INK }}>
          {preferenceLabel(categorie, cle, language)}
          {lectureSeule ? (
            <span className="ms-2 text-caption" style={{ color: INK2 }}>
              · {translateAdmin(language, 'admin.prefs.readOnly')}
            </span>
          ) : null}
        </label>
        <p className="break-words text-caption" style={{ color: INK2 }} data-admin-preference-value="">
          {interpretPreferenceValue(categorie, cle, valeur, language)}
        </p>
      </div>
      <Controle id={idControle} categorie={categorie} cle={cle} valeur={valeur} language={language} desactive={lectureSeule} onChange={onChange} />
    </li>
  );
}

function Controle({
  id,
  categorie,
  cle,
  valeur,
  language,
  desactive,
  onChange,
}: {
  readonly id: string;
  readonly categorie: AdminPreferenceCategory;
  readonly cle: string;
  readonly valeur: AdminPreferenceValue;
  readonly language: AdminLanguage;
  readonly desactive: boolean;
  readonly onChange: (valeur: AdminPreferenceValue) => void;
}) {
  const chemin = `${categorie}.${cle}`;
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
        className="relative h-7 w-12 shrink-0 rounded-full transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-50"
        style={{ backgroundColor: valeur ? 'var(--color-ios-brand)' : 'color-mix(in srgb, var(--color-ios-ink-3) 35%, transparent)', outlineColor: 'var(--color-ios-brand)' }}
      >
        <span
          aria-hidden="true"
          className="absolute top-0.5 size-6 rounded-full bg-ios-on-brand transition-all"
          style={{ insetInlineStart: valeur ? 'calc(100% - 1.625rem)' : '0.125rem' }}
        />
      </button>
    );
  }
  const options = preferenceOptions(categorie, cle, language);
  if (options !== null && typeof valeur === 'string') {
    /* Une valeur SERVIE hors de la liste (une option plus récente que ce client) reste choisie et
       visible : la remplacer en silence par la première option ferait « changer » la préférence. */
    const liste = options.some((option) => option.value === valeur) ? options : [{ value: valeur, label: interpretPreferenceValue(categorie, cle, valeur, language) }, ...options];
    return (
      <select
        id={id}
        value={valeur}
        disabled={desactive}
        data-admin-preference-select={chemin}
        onChange={(event) => onChange(event.currentTarget.value)}
        className="min-h-11 shrink-0 rounded-chip px-2 text-input focus-visible:outline-2 focus-visible:outline-offset-2"
        style={{ ...CARTE, color: INK, outlineColor: 'var(--color-ios-brand)' }}
      >
        {liste.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    );
  }
  if (typeof valeur === 'number' || typeof valeur === 'string') {
    return <ChampLibre key={String(valeur)} id={id} chemin={chemin} valeur={valeur} desactive={desactive} onChange={onChange} />;
  }
  return null;
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
      className="min-h-11 w-32 shrink-0 rounded-chip px-2 text-input tabular-nums focus-visible:outline-2 focus-visible:outline-offset-2"
      style={{ ...CARTE, color: INK, outlineColor: 'var(--color-ios-brand)' }}
    />
  );
}
