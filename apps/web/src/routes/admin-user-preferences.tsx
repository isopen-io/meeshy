import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { CollapsibleSection } from '@/components/collapsible-section';
import { Sheet } from '@/components/sheet';
import { adminMoment } from '@/lib/admin/format';
import type { AdminDeps } from '@/lib/api/admin';
import {
  adminUserPreferencesQueryKey,
  adminUserPreferencesQueryOptions,
  patchAdminUserPreference,
  type AdminPreferenceCategory,
  type AdminPreferenceCategoryId,
  type AdminPreferenceField,
  type AdminPreferenceWrite,
  type AdminUserPreferences,
} from '@/lib/api/admin-user-preferences';
import { apiDeps } from '@/lib/api/deps';
import { translateAdmin, type AdminPlainCatalogKey } from '@/lib/i18n-admin-catalog';
import { translate } from '@/lib/i18n-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';
import { ActionButton } from '@/routes/link-page-parts';

import { AdminAbsence, AdminSkeleton } from './admin-parts';

/**
 * **LES PRÉFÉRENCES D'UN MEMBRE, LUES ET ÉCRITES DEPUIS SA FICHE** (#7845 A/B).
 *
 * ## Tout se VOIT, l'écriture se DEMANDE
 *
 * Chaque catégorie montre chacune de ses clés et sa valeur EFFECTIVE, avec un
 * badge qui dit si elle est posée ou si c'est le défaut d'usine. Écrire passe
 * par une feuille, catégorie par catégorie : on n'écrit pas les réglages d'un
 * autre en effleurant un interrupteur au milieu d'une liste qu'on est venu
 * LIRE.
 *
 * ## Le contrôle vient du DESCRIPTEUR servi
 *
 * Interrupteur (`role="switch"`) pour un booléen, `<select>` pour une liste
 * fermée, champ numérique BORNÉ pour un nombre, texte sinon ; ce que la
 * passerelle déclare en lecture seule (consentements, `extras`…) n'a AUCUN
 * contrôle — un interrupteur qu'elle refuserait en 403 serait un geste perdu
 * d'avance (`admin-user-preferences.ts`).
 *
 * ## Optimiste, et réversible
 *
 * L'écran applique l'écriture au cache AVANT la réponse (dimension 4), et la
 * défait sur un refus — en disant lequel : « le membre n'a pas donné ce
 * consentement » n'est ni une panne ni une faute de saisie. Seules les clés
 * CHANGÉES partent : réécrire une valeur égale ferait passer un défaut d'usine
 * pour une valeur posée par le membre.
 *
 * ## Les libellés sont les CLÉS
 *
 * Les préférences sont techniques et nombreuses (une centaine) ; les traduire
 * une à une en sept langues ferait un second registre à tenir en miroir du
 * schéma. La clé est montrée en police à chasse fixe, découpée à ses
 * majuscules — lisible, et exactement ce qu'un administrateur retrouvera dans
 * le journal d'audit.
 */

const INK = 'var(--color-ios-ink)';
const INK2 = 'var(--color-ios-ink-2)';
const BRAND = 'var(--color-ios-brand)';

const CATEGORIES: Readonly<Record<AdminPreferenceCategoryId, AdminPlainCatalogKey>> = {
  privacy: 'admin.pref.cat.privacy',
  audio: 'admin.pref.cat.audio',
  message: 'admin.pref.cat.message',
  notification: 'admin.pref.cat.notification',
  video: 'admin.pref.cat.video',
  document: 'admin.pref.cat.document',
  application: 'admin.pref.cat.application',
};

const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;

export const humanizeKey = (cle: string): string => cle.replace(/([a-z0-9])([A-Z])/g, '$1 $2').toLowerCase();

/** Ce qu'une valeur DIT, dans la langue de la page. */
export function preferenceValueText(valeur: unknown, language: InterfaceLanguage): string {
  if (valeur === null || valeur === undefined || valeur === '') return '—';
  if (typeof valeur === 'boolean') return translateAdmin(language, valeur ? 'admin.user.enabled' : 'admin.users.inactive');
  if (typeof valeur === 'number') return Number.isFinite(valeur) ? new Intl.NumberFormat(language).format(valeur) : '—';
  if (typeof valeur === 'string') return ISO.test(valeur) ? adminMoment(valeur, language) : valeur;
  if (Array.isArray(valeur)) return valeur.length === 0 ? '—' : valeur.map((v) => preferenceValueText(v, language)).join(', ');
  const cles = Object.keys(valeur);
  return cles.length === 0 ? '—' : cles.join(', ');
}

/** Le cache, une écriture APPLIQUÉE — clé par clé, sans toucher aux autres catégories. */
function appliquer(
  preferences: AdminUserPreferences,
  categorie: AdminPreferenceCategoryId,
  valeurs: Readonly<Record<string, unknown>>,
  stockees?: readonly string[],
): AdminUserPreferences {
  return {
    ...preferences,
    categories: preferences.categories.map((c) =>
      c.id !== categorie
        ? c
        : {
            ...c,
            fields: c.fields.map((champ) => {
              const touche = Object.hasOwn(valeurs, champ.key);
              return {
                ...champ,
                value: touche ? valeurs[champ.key] : champ.value,
                stored: stockees === undefined ? champ.stored || touche : stockees.includes(champ.key),
              };
            }),
          },
    ),
  };
}

function refusDe(code: string): AdminPlainCatalogKey {
  return code === 'CONSENT_REQUIRED' ? 'admin.pref.consent' : 'admin.pref.failed';
}

export function AdminUserPreferencesPanel({
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
  const preferences = useQuery(adminUserPreferencesQueryOptions(deps, userId));
  const [edition, setEdition] = useState<AdminPreferenceCategory | null>(null);

  async function ecrire(categorie: AdminPreferenceCategoryId, valeurs: Readonly<Record<string, unknown>>, motif: string) {
    const cle = adminUserPreferencesQueryKey(userId);
    await client.cancelQueries({ queryKey: cle });
    const instantane = client.getQueryData<AdminUserPreferences>(cle);
    if (instantane !== undefined) client.setQueryData(cle, appliquer(instantane, categorie, valeurs));

    const resultat = await patchAdminUserPreference({
      ...deps,
      userId,
      category: categorie,
      values: valeurs,
      ...(motif.trim() === '' ? {} : { reason: motif }),
    });

    if (!resultat.ok) {
      if (instantane !== undefined) client.setQueryData(cle, instantane);
      onAnnounce(translateAdmin(language, refusDe(resultat.error)));
      return;
    }
    const ecrite: AdminPreferenceWrite = resultat.data;
    client.setQueryData<AdminUserPreferences>(cle, (courant) =>
      courant === undefined ? courant : appliquer(courant, categorie, { ...valeurs, ...ecrite.values }, ecrite.stored.length === 0 ? undefined : ecrite.stored),
    );
    onAnnounce(translateAdmin(language, 'admin.pref.saved'));
  }

  if (preferences.data === undefined) {
    return preferences.isPending ? <AdminSkeleton rows={4} /> : <AdminAbsence language={language} unavailable="admin.pref.unavailable" />;
  }

  return (
    <div className="grid gap-5" data-admin-preferences>
      {preferences.data.categories.map((categorie) => (
        <CollapsibleSection key={categorie.id} id={`admin-pref-${categorie.id}`} title={translateAdmin(language, CATEGORIES[categorie.id])} card={false}>
          <div
            data-admin-pref-category={categorie.id}
            className="grid rounded-card"
            style={{ backgroundColor: 'var(--color-ios-surface)', border: '1px solid var(--color-edge)' }}
          >
            <ul className="grid divide-y px-4" style={{ borderColor: 'var(--color-edge)' }}>
              {categorie.fields.map((champ) => (
                <LignePreference key={champ.key} champ={champ} language={language} />
              ))}
            </ul>
            {categorie.fields.some((champ) => champ.kind !== 'readonly') ? (
              <div className="px-4 pb-3 pt-1">
                <button
                  type="button"
                  data-admin-pref-edit={categorie.id}
                  onClick={() => setEdition(categorie)}
                  className="rounded-chip px-4 text-body font-semibold focus-visible:outline-2 focus-visible:outline-offset-2"
                  style={{ minHeight: 44, color: BRAND, outlineColor: BRAND, backgroundColor: 'color-mix(in srgb, var(--color-ios-brand) 10%, transparent)' }}
                >
                  {translateAdmin(language, 'admin.pref.edit', { category: translateAdmin(language, CATEGORIES[categorie.id]) })}
                </button>
              </div>
            ) : null}
          </div>
        </CollapsibleSection>
      ))}

      {edition === null ? null : (
        <FeuillePreferences
          // Remonter la feuille à chaque ouverture repart du cache COURANT —
          // un brouillon d'une ouverture précédente ne survit pas.
          key={edition.id}
          categorie={preferences.data.categories.find((c) => c.id === edition.id) ?? edition}
          language={language}
          onClose={() => setEdition(null)}
          onSubmit={(valeurs, motif) => {
            setEdition(null);
            void ecrire(edition.id, valeurs, motif);
          }}
        />
      )}
    </div>
  );
}

function Badge({ texte, data }: { readonly texte: string; readonly data?: boolean }) {
  return (
    <span
      {...(data === true ? { 'data-admin-pref-badge': '' } : {})}
      className="rounded-chip px-2 py-0.5 text-[11px] font-semibold"
      style={{ color: INK2, backgroundColor: 'color-mix(in srgb, var(--color-ios-ink-3) 14%, transparent)' }}
    >
      {texte}
    </span>
  );
}

function LignePreference({ champ, language }: { readonly champ: AdminPreferenceField; readonly language: InterfaceLanguage }) {
  return (
    <li data-admin-pref-field={champ.key} className="flex min-h-11 flex-wrap items-center gap-x-3 gap-y-1 py-2.5" style={{ borderColor: 'var(--color-edge)' }}>
      <span className="min-w-0 flex-1 break-words font-mono text-caption [overflow-wrap:anywhere]" style={{ color: INK2 }} title={champ.key}>
        {humanizeKey(champ.key)}
      </span>
      <span className="flex min-w-0 flex-wrap items-center gap-1.5">
        {champ.readOnly ? <Badge texte={translateAdmin(language, 'admin.pref.readOnly')} /> : null}
        <Badge data texte={translateAdmin(language, champ.stored ? 'admin.pref.custom' : 'admin.pref.default')} />
        <span data-admin-pref-value={champ.key} className="min-w-0 break-words text-end text-body font-medium [overflow-wrap:anywhere]" style={{ color: INK }}>
          {preferenceValueText(champ.value, language)}
        </span>
      </span>
    </li>
  );
}

const CONTROLE = {
  minHeight: 44,
  backgroundColor: 'var(--color-ios-surface)',
  border: '1px solid var(--color-edge)',
  color: INK,
} as const;

function FeuillePreferences({
  categorie,
  language,
  onClose,
  onSubmit,
}: {
  readonly categorie: AdminPreferenceCategory;
  readonly language: InterfaceLanguage;
  readonly onClose: () => void;
  readonly onSubmit: (valeurs: Readonly<Record<string, unknown>>, motif: string) => void;
}) {
  const [brouillon, setBrouillon] = useState<Readonly<Record<string, unknown>>>(() =>
    Object.fromEntries(categorie.fields.map((champ) => [champ.key, champ.value])),
  );
  const [motif, setMotif] = useState('');

  const changees = Object.fromEntries(
    categorie.fields
      .filter((champ) => champ.kind !== 'readonly' && !Object.is(brouillon[champ.key], champ.value))
      .map((champ) => [champ.key, brouillon[champ.key]]),
  );
  const nombre = Object.keys(changees).length;
  const poser = (cle: string, valeur: unknown) => setBrouillon((avant) => ({ ...avant, [cle]: valeur }));

  return (
    <Sheet title={translateAdmin(language, CATEGORIES[categorie.id])} bodyAs="div" onClose={onClose}>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-6" data-admin-pref-sheet={categorie.id}>
        <div className="grid gap-3">
          <label className="grid gap-1">
            <span className="text-caption" style={{ color: INK2 }}>
              {translateAdmin(language, 'admin.pref.reason')}
            </span>
            <input
              data-admin-pref-reason
              value={motif}
              onInput={(event) => setMotif(event.currentTarget.value)}
              className="rounded-chip px-4 text-body"
              style={CONTROLE}
            />
          </label>

          <ul className="grid gap-2">
            {categorie.fields.map((champ) => (
              <li key={champ.key} className="grid gap-1">
                <span className="font-mono text-caption" style={{ color: INK2 }} id={`admin-pref-label-${champ.key}`}>
                  {humanizeKey(champ.key)}
                </span>
                <Controle champ={champ} valeur={brouillon[champ.key]} language={language} onValeur={(v) => poser(champ.key, v)} />
              </li>
            ))}
          </ul>

          <div className="grid gap-2 pt-2">
            <ActionButton data={{ 'data-admin-pref-save': '' }} disabled={nombre === 0} onClick={() => onSubmit(changees, motif)}>
              {translateAdmin(language, 'admin.convSettings.save')}
            </ActionButton>
            <ActionButton tone="secondary" onClick={onClose}>
              {translate(language, 'common.cancel')}
            </ActionButton>
          </div>
        </div>
      </div>
    </Sheet>
  );
}

function Controle({
  champ,
  valeur,
  language,
  onValeur,
}: {
  readonly champ: AdminPreferenceField;
  readonly valeur: unknown;
  readonly language: InterfaceLanguage;
  readonly onValeur: (valeur: unknown) => void;
}) {
  const libelle = `admin-pref-label-${champ.key}`;

  if (champ.kind === 'boolean') {
    const actif = valeur === true;
    return (
      <button
        type="button"
        role="switch"
        aria-checked={actif}
        aria-labelledby={libelle}
        data-admin-pref-control={champ.key}
        onClick={() => onValeur(!actif)}
        className="flex items-center justify-between gap-3 rounded-chip px-4 text-body"
        style={CONTROLE}
      >
        <span>{preferenceValueText(actif, language)}</span>
        <span
          aria-hidden="true"
          className="relative h-6 w-10 shrink-0 rounded-full transition-colors motion-reduce:transition-none"
          style={{ backgroundColor: actif ? BRAND : 'color-mix(in srgb, var(--color-ios-ink-3) 35%, transparent)' }}
        >
          <span
            className="absolute top-0.5 size-5 rounded-full bg-white transition-[inset-inline-start] motion-reduce:transition-none"
            style={{ insetInlineStart: actif ? 18 : 2 }}
          />
        </span>
      </button>
    );
  }

  if (champ.kind === 'enum') {
    const options = champ.options ?? [];
    /* Une valeur hors des options (null, ou une valeur héritée) se montre par
       le tiret : sans lui, le navigateur afficherait la PREMIÈRE option comme
       choisie, et la choisir ne déclencherait aucun `change` — elle ne
       pourrait jamais s'écrire. Le tiret, lui, ne s'écrit pas. */
    const courante = typeof valeur === 'string' && options.includes(valeur) ? valeur : '';
    return (
      <select
        aria-labelledby={libelle}
        data-admin-pref-control={champ.key}
        value={courante}
        onChange={(event) => {
          const choisie = event.currentTarget.value;
          if (choisie !== '') onValeur(choisie);
        }}
        className="rounded-chip px-4 text-body"
        style={CONTROLE}
      >
        {courante === '' ? <option value="">—</option> : null}
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    );
  }

  if (champ.kind === 'number') {
    return (
      <input
        type="number"
        inputMode="decimal"
        aria-labelledby={libelle}
        data-admin-pref-control={champ.key}
        {...(champ.min === undefined ? {} : { min: champ.min })}
        {...(champ.max === undefined ? {} : { max: champ.max })}
        value={typeof valeur === 'number' ? String(valeur) : ''}
        onInput={(event) => {
          const nombre = Number(event.currentTarget.value);
          // Un champ vidé ou illisible ne s'écrit pas : `Number('')` vaut 0,
          // et un volume remis à zéro par une touche Effacer serait un geste
          // que personne n'a voulu.
          if (event.currentTarget.value !== '' && Number.isFinite(nombre)) onValeur(nombre);
        }}
        className="rounded-chip px-4 text-body tabular-nums"
        style={CONTROLE}
      />
    );
  }

  if (champ.kind === 'text') {
    return (
      <input
        aria-labelledby={libelle}
        data-admin-pref-control={champ.key}
        value={typeof valeur === 'string' ? valeur : ''}
        onInput={(event) => onValeur(event.currentTarget.value)}
        className="rounded-chip px-4 text-body"
        style={CONTROLE}
      />
    );
  }

  return (
    <p data-admin-pref-readonly={champ.key} className="flex items-center justify-between gap-3 rounded-chip px-4 py-2.5 text-body" style={{ ...CONTROLE, color: INK2 }}>
      <span>{preferenceValueText(valeur, language)}</span>
      <Badge texte={translateAdmin(language, 'admin.pref.readOnly')} />
    </p>
  );
}
