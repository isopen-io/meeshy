/**
 * Ce qu'un appelant DEMANDE — `?categories=` et `?fields=`, résolus une fois.
 *
 * `GET /me/preferences` renvoyait les sept catégories, soit ~130 clés, alors
 * qu'un écran de réglages n'en lit qu'une quinzaine. Le poids n'est pas le seul
 * coût : la réponse changeait dès qu'une catégorie sans rapport bougeait, ce qui
 * rend tout `If-None-Match` inopérant — un 304 sur l'écran des notifications
 * devenait impossible parce qu'un thème venait de changer.
 *
 * La sélection est PURE et rendue en un objet : elle se teste sans monter de
 * route, et les trois routes unifiées la partagent au lieu de reparser leurs
 * paramètres chacune à leur façon.
 *
 * ## Pourquoi une demande inconnue rend 400 et non un silence
 *
 * `?categories=notifications` (au pluriel) ou `?fields=application.theme2` sont
 * des fautes de frappe. Les ignorer sert une réponse VIDE ou PARTIELLE qui a
 * l'air d'une vérité : « cette catégorie n'a aucun réglage », « cette clé
 * n'existe plus ». Le client n'a alors aucun moyen de distinguer sa faute d'un
 * état légitime — et c'est exactement la classe de défaut que ce module
 * remplace. Une demande qu'on ne peut pas honorer se refuse en le disant.
 *
 * `?categories=` VIDE vaut absent — donc « tout ». C'est le contrat écrit dans
 * `docs/product/api-simplification/me.md` (« `?categories=` (absent = tout) »),
 * et il vaut aussi pour le `DELETE` : une remise à zéro sans liste remet tout.
 */

import {
  PREFERENCE_CATEGORIES,
  PREFERENCE_REGISTRY,
  isPreferenceCategory,
  type PreferenceCategory,
  type PreferenceDocument,
} from './preference-registry';

export type SelectionFailure = {
  readonly code: 'UNKNOWN_CATEGORY' | 'UNKNOWN_FIELD' | 'FIELD_OUTSIDE_CATEGORIES';
  readonly message: string;
};

export type PreferenceSelection = {
  /** Les catégories à servir, dans l'ordre du registre. */
  readonly categories: readonly PreferenceCategory[];
  /**
   * Par catégorie, les clés retenues. Une catégorie ABSENTE de cette carte est
   * servie ENTIÈRE — distinction voulue : un ensemble vide voudrait dire « aucune
   * clé », ce qui n'est jamais ce qu'un appelant demande.
   */
  readonly fields: ReadonlyMap<PreferenceCategory, ReadonlySet<string>>;
};

export type SelectionResult =
  | { readonly ok: true; readonly selection: PreferenceSelection }
  | { readonly ok: false; readonly failure: SelectionFailure };

const splitList = (value: string | undefined): readonly string[] =>
  (value ?? '')
    .split(',')
    .map((token) => token.trim())
    .filter((token) => token.length > 0);

/** Les clés qu'une catégorie CONNAÎT — celles de ses défauts. */
const knownKeys = (category: PreferenceCategory): readonly string[] =>
  Object.keys(PREFERENCE_REGISTRY[category].defaults);

const inRegistryOrder = (
  categories: ReadonlySet<PreferenceCategory>
): readonly PreferenceCategory[] => PREFERENCE_CATEGORIES.filter((c) => categories.has(c));

/**
 * Résout `?categories=` et `?fields=` en un plan de service.
 *
 * `fields` accepte deux formes : `catégorie.clé` (une clé précise) et
 * `catégorie` (toutes ses clés). La seconde n'est pas un raccourci de confort —
 * elle permet à un écran de composer UNE seule liste quand il lit une catégorie
 * entière et deux clés d'une autre, au lieu de tenir deux paramètres dont l'un
 * contredirait l'autre.
 *
 * Quand les deux paramètres sont donnés, `fields` doit rester DANS
 * `categories` : la contradiction (`?categories=audio&fields=video.quality`) est
 * refusée plutôt qu'arbitrée, parce qu'aucun arbitrage n'est celui que
 * l'appelant voulait.
 */
export function parseSelection(query: {
  readonly categories?: string;
  readonly fields?: string;
}): SelectionResult {
  const requested = splitList(query.categories);

  for (const token of requested) {
    if (!isPreferenceCategory(token)) {
      return {
        ok: false,
        failure: {
          code: 'UNKNOWN_CATEGORY',
          message: `Unknown preference category '${token}'`,
        },
      };
    }
  }

  const requestedCategories: readonly PreferenceCategory[] = requested.filter(isPreferenceCategory);
  const scope: ReadonlySet<PreferenceCategory> =
    requestedCategories.length > 0 ? new Set(requestedCategories) : new Set(PREFERENCE_CATEGORIES);

  const fieldTokens = splitList(query.fields);

  if (fieldTokens.length === 0) {
    return { ok: true, selection: { categories: inRegistryOrder(scope), fields: new Map() } };
  }

  const wholeCategories = new Set<PreferenceCategory>();
  const keyedCategories = new Map<PreferenceCategory, Set<string>>();
  const touched = new Set<PreferenceCategory>();

  for (const token of fieldTokens) {
    const separator = token.indexOf('.');
    const categoryToken = separator === -1 ? token : token.slice(0, separator);
    const key = separator === -1 ? null : token.slice(separator + 1);

    if (!isPreferenceCategory(categoryToken)) {
      return {
        ok: false,
        failure: {
          code: 'UNKNOWN_CATEGORY',
          message: `Unknown preference category '${categoryToken}' in fields`,
        },
      };
    }

    if (requestedCategories.length > 0 && !scope.has(categoryToken)) {
      return {
        ok: false,
        failure: {
          code: 'FIELD_OUTSIDE_CATEGORIES',
          message: `Field '${token}' names a category absent from categories`,
        },
      };
    }

    touched.add(categoryToken);

    if (key === null) {
      wholeCategories.add(categoryToken);
      continue;
    }

    if (!knownKeys(categoryToken).includes(key)) {
      return {
        ok: false,
        failure: { code: 'UNKNOWN_FIELD', message: `Unknown preference field '${token}'` },
      };
    }

    const keys = keyedCategories.get(categoryToken) ?? new Set<string>();
    keys.add(key);
    keyedCategories.set(categoryToken, keys);
  }

  // Une catégorie nommée ENTIÈRE gagne sur ses clés nommées une à une : citer
  // `audio` puis `audio.quality` ne peut pas RESTREINDRE ce que le premier
  // jeton demandait. L'appelant a nommé les deux — il veut les deux.
  const fields = new Map<PreferenceCategory, ReadonlySet<string>>();
  for (const [category, keys] of keyedCategories) {
    if (!wholeCategories.has(category)) fields.set(category, keys);
  }

  return { ok: true, selection: { categories: inRegistryOrder(touched), fields } };
}

/** Ne garde d'un document que les clés retenues pour sa catégorie. */
export function applyFields(
  document: PreferenceDocument,
  keys: ReadonlySet<string> | undefined
): PreferenceDocument {
  if (!keys) return document;
  return Object.fromEntries(Object.entries(document).filter(([key]) => keys.has(key)));
}

/** Projette un état complet sur la sélection — les catégories ET leurs clés. */
export function projectSelection(
  complete: Record<string, PreferenceDocument>,
  selection: PreferenceSelection
): Record<string, PreferenceDocument> {
  return Object.fromEntries(
    selection.categories.map((category) => [
      category,
      applyFields(complete[category] ?? {}, selection.fields.get(category)),
    ])
  );
}
