import { getLanguagesWithTranslation } from '@meeshy/shared/utils/languages';

import type { AdminBroadcast, AdminBroadcastActivity, AdminBroadcastBody, AdminBroadcastTargeting } from '@/lib/api/admin-broadcasts';
import { COUNTRIES } from '@/lib/countries';
import type { AdminLanguage } from '@/lib/i18n-admin-catalog';

import { countryName, languageName, sentenceCase } from './interpret/language';

/**
 * **LE FORMULAIRE D'UNE DIFFUSION** (#8876, #6731) — ce que la feuille de
 * composition pose, valide champ par champ, et envoie.
 *
 * La passerelle ne contrôle que la PRÉSENCE des quatre champs
 * (`!name || !subject || !body || !sourceLanguage` → un 400 générique) : chaque
 * erreur se dit donc ICI, sous son champ, avant l'envoi. La durée d'inactivité
 * vit en TEXTE dans le formulaire (c'est ce que l'`<input>` tient) et n'est lue en
 * nombre qu'à l'envoi.
 */
export const INACTIVE_DAYS_DEFAULT = 30;
export const INACTIVE_DAYS_MAX = 3650;

export type BroadcastForm = {
  readonly name: string;
  readonly subject: string;
  readonly body: string;
  readonly sourceLanguage: string;
  readonly activity: AdminBroadcastActivity;
  readonly inactiveDays: string;
  readonly languages: readonly string[];
  readonly countries: readonly string[];
};

export type BroadcastFormField = 'name' | 'subject' | 'body' | 'sourceLanguage' | 'inactiveDays';

export const newBroadcastForm = (sourceLanguage: string): BroadcastForm => ({
  name: '',
  subject: '',
  body: '',
  sourceLanguage,
  activity: 'all',
  inactiveDays: String(INACTIVE_DAYS_DEFAULT),
  languages: [],
  countries: [],
});

/** La langue dans laquelle on écrit par défaut : celle de l'ADMINISTRATION — les quatre sont des langues que la traduction sait servir. */
export const defaultSourceLanguage = (language: AdminLanguage): string => language;

export const formOfBroadcast = (broadcast: Pick<AdminBroadcast, 'name' | 'subject' | 'body' | 'sourceLanguage' | 'targeting'>): BroadcastForm => ({
  name: broadcast.name,
  subject: broadcast.subject,
  body: broadcast.body,
  sourceLanguage: broadcast.sourceLanguage,
  activity: broadcast.targeting.activity,
  inactiveDays: String(broadcast.targeting.inactiveDays ?? INACTIVE_DAYS_DEFAULT),
  languages: broadcast.targeting.languages,
  countries: broadcast.targeting.countries,
});

const DAYS = /^\d+$/;

function inactiveDaysOf(form: BroadcastForm): number | null {
  const text = form.inactiveDays.trim();
  if (!DAYS.test(text)) return null;
  const days = Number(text);
  return days >= 1 && days <= INACTIVE_DAYS_MAX ? days : null;
}

export function validateBroadcastForm(form: BroadcastForm): readonly BroadcastFormField[] {
  const errors: readonly (BroadcastFormField | null)[] = [
    form.name.trim() === '' ? 'name' : null,
    form.subject.trim() === '' ? 'subject' : null,
    form.body.trim() === '' ? 'body' : null,
    form.sourceLanguage.trim() === '' ? 'sourceLanguage' : null,
    form.activity === 'inactive' && inactiveDaysOf(form) === null ? 'inactiveDays' : null,
  ];
  return errors.flatMap((error) => (error === null ? [] : [error]));
}

/** L'audience telle qu'elle se DIT pendant la saisie : une durée illisible retombe sur la fenêtre par défaut, jamais sur NaN. */
export function targetingOfForm(form: BroadcastForm): AdminBroadcastTargeting {
  return {
    activity: form.activity,
    inactiveDays: form.activity === 'inactive' ? (inactiveDaysOf(form) ?? INACTIVE_DAYS_DEFAULT) : null,
    languages: form.languages,
    countries: form.countries,
  };
}

/** Le corps exact envoyé : les champs nettoyés aux bords, et le ciblage réduit à ce qui filtre vraiment. */
export function bodyOfForm(form: BroadcastForm): AdminBroadcastBody {
  const days = inactiveDaysOf(form);
  return {
    name: form.name.trim(),
    subject: form.subject.trim(),
    body: form.body.trim(),
    sourceLanguage: form.sourceLanguage.trim(),
    targeting: {
      activityStatus: form.activity,
      ...(form.activity === 'inactive' && days !== null ? { inactiveDays: days } : {}),
      ...(form.languages.length === 0 ? {} : { languages: form.languages }),
      ...(form.countries.length === 0 ? {} : { countries: form.countries }),
    },
  };
}

export type ChoiceOption = { readonly value: string; readonly label: string };

const byLabel = (language: AdminLanguage) => (a: ChoiceOption, b: ChoiceOption) => a.label.localeCompare(b.label, language);

/**
 * LES LANGUES QU'ON PEUT CHOISIR — celles que la traduction sait servir (la
 * liste du référentiel partagé), nommées dans la langue d'interface et triées par
 * nom. `extra` ajoute les codes déjà enregistrés sur une diffusion qui
 * n'appartiennent pas à la liste : les retirer en silence changerait le ciblage
 * d'un brouillon au simple fait de l'ouvrir.
 */
export function languageOptions(language: AdminLanguage, extra: readonly string[] = []): readonly ChoiceOption[] {
  const known = getLanguagesWithTranslation().map((info) => info.code);
  const codes = [...new Set([...known, ...extra])];
  return codes.map((code) => ({ value: code, label: sentenceCase(languageName(code, language), language) })).sort(byLabel(language));
}

/** LES PAYS — ceux que garde la liste de l'application (`lib/countries.ts`, générée), nommés dans la langue d'interface. */
export function countryOptions(language: AdminLanguage): readonly ChoiceOption[] {
  return COUNTRIES.map((country) => ({ value: country.id, label: countryName(country.id, language) })).sort(byLabel(language));
}
