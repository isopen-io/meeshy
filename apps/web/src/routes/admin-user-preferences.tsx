import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { AdminFormError, AdminSelect, AdminSwitch } from '@/components/admin/form';
import { AdminErrorState, AdminSkeleton } from '@/components/admin/states';
import { EDGE, INK, INK2, SURFACE } from '@/components/admin/tone';
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
const CARTE = { backgroundColor: SURFACE, border: `1px solid ${EDGE}` } as const;

const LIBELLES_CATEGORIES = {
  privacy: 'admin.prefs.privacy',
  notification: 'admin.prefs.notification',
  message: 'admin.prefs.message',
  audio: 'admin.prefs.audio',
  video: 'admin.prefs.video',
  document: 'admin.prefs.document',
  application: 'admin.prefs.application',
} as const satisfies Readonly<Record<AdminPreferenceCategory, string>>;

/**
 * La passerelle sert le refus de consentement sous `code` (fd52a01818) ; un serveur
 * d'avant ne le portait que dans `error` — les deux se lisent pareil.
 */
const motifDuRefus = (echec: ApiFailure, language: AdminLanguage): string => {
  if (echec.code === 'CONSENT_REQUIRED' || echec.error === 'CONSENT_REQUIRED') return translateAdmin(language, 'admin.prefs.consent');
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
  /* Un échec de lecture a son issue (« Réessayer ») : un onglet qui dit « indisponible » sans
     geste laisse l'administrateur recharger toute la fiche pour relire une seule source. */
  if (preferences.data === undefined) {
    return <AdminErrorState language={language} message={translateAdmin(language, 'admin.users.unavailable')} onRetry={() => void preferences.refetch()} />;
  }
  const donnees = preferences.data;

  return (
    <div className="grid gap-4" data-admin-preferences="">
      <p className="text-caption" style={{ color: INK2 }}>
        {translateAdmin(language, 'admin.prefs.notice')}
      </p>
      {refus === null ? null : <AdminFormError text={refus} data={{ 'data-admin-preferences-error': '' }} />}
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
  /* Les contrôles sont ceux du kit, montés SANS libellé : la rangée nomme déjà la préférence
     (`label htmlFor`) et dit sa valeur en mots. */
  if (typeof valeur === 'boolean') {
    return (
      <AdminSwitch id={id} checked={valeur} disabled={desactive} data={{ 'data-admin-preference-switch': chemin }} onToggle={(suivante) => onChange(suivante)} />
    );
  }
  const options = preferenceOptions(categorie, cle, language);
  if (options !== null && typeof valeur === 'string') {
    return (
      <div className="shrink-0">
        <AdminSelect
          id={id}
          value={valeur}
          options={options}
          disabled={desactive}
          data={{ 'data-admin-preference-select': chemin }}
          fallbackLabel={(servie) => interpretPreferenceValue(categorie, cle, servie, language)}
          onValue={(suivante) => onChange(suivante)}
        />
      </div>
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
