import { type AdminDeps, asRecord } from './admin';
import type { ApiResult } from './http';
import { ADMIN_SOUVERAIN_PREFIXE } from './souverain';

/**
 * **LES PRÉFÉRENCES D'UN MEMBRE, DEPUIS SA FICHE** (#7845 A/B) —
 * `GET /api/v1/admin/users/:userId/preferences` (`canViewSensitiveData`,
 * ADMIN+) et `PATCH …/preferences/:category` (`canUpdateUsers` + rang sur la
 * cible).
 *
 * ## Le contrôle d'un champ se lit dans le DESCRIPTEUR, jamais dans la valeur
 *
 * La passerelle sert, pour chaque catégorie, la description JSON du schéma zod
 * qui la valide (`preference-descriptors.ts`) : `type`, `enum`, `minimum`,
 * `maximum`, `default`. C'est elle qui décide du contrôle — interrupteur,
 * liste, nombre borné, texte. Deviner depuis la valeur (`typeof false`) ferait
 * d'un champ nullable un texte, et d'une liste fermée un champ libre que le
 * serveur refuserait ensuite en 400 : l'écran proposerait un geste qu'il sait
 * perdu d'avance.
 *
 * Ce qui n'est pas décrit simplement (tableau, objet, union nullable) est rendu
 * en LECTURE SEULE. Un éditeur générique de structures imbriquées serait un
 * moyen d'écrire ce que ni le membre ni ses clients n'ont jamais écrit.
 *
 * ## La lecture seule servie GAGNE
 *
 * `readOnly` (consentements, `voiceCloningEnabledAt`, `extras`,
 * `tutorialsCompleted`) est une décision du SERVEUR, qui la tient aussi en
 * écriture (403 `READ_ONLY_PREFERENCE`). Le client ne la recalcule pas : une
 * jumelle de `isAdminReadOnlyPreference` divergerait au premier consentement
 * ajouté, et proposerait un interrupteur sur une pièce légale.
 *
 * ## Une clé QUI NE TOUCHE PAS LE DISQUE
 *
 * La confidentialité d'un membre — montre-t-il sa présence, se cache-t-il de la
 * recherche — est une donnée privée. Le cache de requêtes étant persisté dans
 * `localStorage`, sa clé descend de {@link ADMIN_SOUVERAIN_PREFIXE}, le seul
 * préfixe que `persistableQuery` exempte.
 */
export const ADMIN_PREFERENCE_CATEGORIES = [
  'privacy',
  'audio',
  'message',
  'notification',
  'video',
  'document',
  'application',
] as const;

export type AdminPreferenceCategoryId = (typeof ADMIN_PREFERENCE_CATEGORIES)[number];

export type AdminPreferenceKind = 'boolean' | 'enum' | 'number' | 'text' | 'readonly';

export type AdminPreferenceField = {
  readonly key: string;
  readonly kind: AdminPreferenceKind;
  /** Présent sur un `enum` seulement. */
  readonly options?: readonly string[];
  readonly min?: number;
  readonly max?: number;
  readonly defaultValue: unknown;
  /** La valeur EFFECTIVE — stockée, ou le défaut complété par la passerelle. */
  readonly value: unknown;
  /** `true` quand le membre (ou un administrateur) a POSÉ cette valeur ;
   * `false` quand elle est le défaut d'usine. */
  readonly stored: boolean;
  readonly readOnly: boolean;
};

export type AdminPreferenceCategory = {
  readonly id: AdminPreferenceCategoryId;
  readonly fields: readonly AdminPreferenceField[];
};

export type AdminUserPreferences = {
  readonly userId: string;
  readonly categories: readonly AdminPreferenceCategory[];
};

export type AdminPreferenceWrite = {
  readonly category: AdminPreferenceCategoryId;
  readonly values: Readonly<Record<string, unknown>>;
  readonly stored: readonly string[];
};

export const adminUserPreferencesQueryKey = (userId: string) =>
  [ADMIN_SOUVERAIN_PREFIXE, 'user', userId, 'preferences'] as const;

export function isAdminPreferenceCategory(value: unknown): value is AdminPreferenceCategoryId {
  return typeof value === 'string' && (ADMIN_PREFERENCE_CATEGORIES as readonly string[]).includes(value);
}

const asStrings = (value: unknown): readonly string[] =>
  Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];

const asFinite = (value: unknown): number | undefined =>
  typeof value === 'number' && Number.isFinite(value) ? value : undefined;

function kindOf(descripteur: Readonly<Record<string, unknown>>, readOnly: boolean): AdminPreferenceKind {
  if (readOnly) return 'readonly';
  if (asStrings(descripteur.enum).length > 0) return 'enum';
  if (descripteur.type === 'boolean') return 'boolean';
  if (descripteur.type === 'number' || descripteur.type === 'integer') return 'number';
  if (descripteur.type === 'string') return 'text';
  return 'readonly';
}

/**
 * UN champ, construit clé par clé : `options`, `min` et `max` ne sont posés que
 * lorsqu'ils portent une valeur (sous `exactOptionalPropertyTypes`, une clé
 * posée à `undefined` n'est pas une clé absente). Rien d'autre du descripteur
 * — `pattern`, `items`, `propertyNames` — n'entre dans l'objet.
 */
function decodeField(options: {
  readonly key: string;
  readonly descripteur: Readonly<Record<string, unknown>>;
  readonly value: unknown;
  readonly stored: boolean;
  readonly readOnly: boolean;
}): AdminPreferenceField {
  const kind = kindOf(options.descripteur, options.readOnly);
  const min = kind === 'number' ? asFinite(options.descripteur.minimum) : undefined;
  const max = kind === 'number' ? asFinite(options.descripteur.maximum) : undefined;

  return {
    key: options.key,
    kind,
    ...(kind === 'enum' ? { options: asStrings(options.descripteur.enum) } : {}),
    ...(min === undefined ? {} : { min }),
    ...(max === undefined ? {} : { max }),
    defaultValue: options.descripteur.default,
    value: options.value,
    stored: options.stored,
    readOnly: options.readOnly,
  };
}

function decodeCategory(id: AdminPreferenceCategoryId, raw: unknown): AdminPreferenceCategory | null {
  const categorie = asRecord(raw);
  if (categorie === null) return null;

  const valeurs = asRecord(categorie.values) ?? {};
  const descripteurs = asRecord(categorie.fields) ?? {};
  const stockees = new Set(asStrings(categorie.stored));
  const lectureSeule = new Set(asStrings(categorie.readOnly));
  // L'ordre du DESCRIPTEUR d'abord (celui du schéma), puis ce que les valeurs
  // portent en plus — même union que `servirCategorie` côté passerelle.
  const cles = [...new Set([...Object.keys(descripteurs), ...Object.keys(valeurs)])];

  return {
    id,
    fields: cles.map((key) =>
      decodeField({
        key,
        descripteur: asRecord(descripteurs[key]) ?? {},
        value: valeurs[key],
        stored: stockees.has(key),
        readOnly: lectureSeule.has(key),
      }),
    ),
  };
}

export function decodeAdminUserPreferences(raw: unknown): AdminUserPreferences | null {
  const charge = asRecord(raw);
  const categories = asRecord(charge?.categories);
  if (charge === null || categories === null || typeof charge.userId !== 'string' || charge.userId === '') return null;

  return {
    userId: charge.userId,
    categories: ADMIN_PREFERENCE_CATEGORIES.map((id) => decodeCategory(id, categories[id])).filter(
      (categorie): categorie is AdminPreferenceCategory => categorie !== null,
    ),
  };
}

export async function loadAdminUserPreferences(
  params: AdminDeps & { readonly userId: string; readonly signal?: AbortSignal },
): Promise<ApiResult<AdminUserPreferences>> {
  const result = await params.transport.request<unknown>({
    method: 'GET',
    path: `/api/v1/admin/users/${encodeURIComponent(params.userId)}/preferences`,
    ...(params.signal === undefined ? {} : { signal: params.signal }),
  });
  if (!result.ok) return result;

  const preferences = decodeAdminUserPreferences(result.data);
  return preferences === null
    ? { ok: false, status: 0, error: 'Préférences illisibles' }
    : { ok: true, data: preferences };
}

/**
 * Trente secondes : l'écran ÉCRIT dans ce cache (mise à jour optimiste), et le
 * membre peut changer ses réglages pendant qu'on le regarde — une fenêtre
 * longue montrerait un état que personne n'a plus.
 */
export function adminUserPreferencesQueryOptions(deps: AdminDeps, userId: string) {
  return {
    queryKey: adminUserPreferencesQueryKey(userId),
    queryFn: async ({ signal }: { readonly signal?: AbortSignal }): Promise<AdminUserPreferences> => {
      const resultat = await loadAdminUserPreferences({ ...deps, userId, ...(signal === undefined ? {} : { signal }) });
      if (!resultat.ok) throw new Error(resultat.error);
      return resultat.data;
    },
    staleTime: 30 * 1000,
    retry: false,
  };
}

function decodeWrite(raw: unknown, demandee: AdminPreferenceCategoryId): AdminPreferenceWrite {
  const charge = asRecord(raw);
  const valeurs = asRecord(charge?.values) ?? {};
  return {
    category: isAdminPreferenceCategory(charge?.category) ? charge.category : demandee,
    values: Object.fromEntries(Object.entries(valeurs)),
    stored: asStrings(charge?.stored),
  };
}

/**
 * Écrit UNE catégorie. Le corps est `{ values, reason? }` — le SEUL qu'accepte
 * la passerelle, qui refuse en 400 toute autre clé de premier niveau.
 *
 * ## Un refus NOMMÉ remonte par son code
 *
 * `READ_ONLY_PREFERENCE`, `CONSENT_REQUIRED` et `VALIDATION_ERROR` ne se
 * traitent pas pareil à l'écran : le deuxième dit « le membre n'a pas consenti »,
 * ce qui n'est ni une panne ni une faute de saisie. Le code devient donc le
 * texte d'erreur — l'écran le traduit —, et reste aussi dans `code`.
 *
 * ## Une écriture vide se refuse ICI
 *
 * La passerelle n'écrit rien sur `values: {}` : l'aller-retour n'apprendrait rien.
 */
export async function patchAdminUserPreference(
  params: AdminDeps & {
    readonly userId: string;
    readonly category: AdminPreferenceCategoryId;
    readonly values: Readonly<Record<string, unknown>>;
    readonly reason?: string;
    readonly signal?: AbortSignal;
  },
): Promise<ApiResult<AdminPreferenceWrite>> {
  if (Object.keys(params.values).length === 0) return { ok: false, status: 0, error: 'Aucune préférence à écrire' };

  const motif = params.reason?.trim() ?? '';
  const result = await params.transport.request<unknown>({
    method: 'PATCH',
    path: `/api/v1/admin/users/${encodeURIComponent(params.userId)}/preferences/${encodeURIComponent(params.category)}`,
    body: { values: params.values, ...(motif === '' ? {} : { reason: motif }) },
    ...(params.signal === undefined ? {} : { signal: params.signal }),
  });
  if (!result.ok) return result.code === undefined ? result : { ...result, error: result.code };

  return { ok: true, data: decodeWrite(result.data, params.category) };
}
