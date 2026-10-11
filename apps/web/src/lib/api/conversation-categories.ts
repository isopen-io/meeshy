import type { QueryClient } from '@tanstack/react-query';
import { useQuery } from '@tanstack/react-query';
import * as meEndpoints from '@meeshy/shared/api/endpoints/me';

import { unwrap } from './client';
import { CONVERSATION_CATEGORIES_QUERY_KEY, type ConversationsDeps } from './conversations';
import { FIXTURE_CONVERSATION_CATEGORIES } from './fixtures-categories';
import type { ApiResult } from './http';

export { CONVERSATION_CATEGORIES_QUERY_KEY };

/**
 * LES CATÉGORIES DU LECTEUR (#10103) — `UserConversationCategory`, servies par
 * `GET /me/categories` (l'adresse CANONIQUE depuis #4359 ; `/me/preferences/
 * categories` n'en est plus que l'alias déprécié, même handler —
 * `services/gateway/src/routes/me/categories.ts`). Triées dans l'ordre que
 * l'utilisateur leur a donné (`order`, réordonnable), c'est l'ordre que la
 * loi des sections respecte sans jamais le refaire (`resolveConversationSections`).
 *
 * `isExpanded` est la PRÉFÉRENCE SERVEUR du pliage, la même qu'iOS écrit
 * (`ConversationListViewModel.persistCategoryExpansion`) : replier une
 * catégorie sur le web la replie sur le téléphone, et inversement.
 *
 * Le nom est celui que l'utilisateur a écrit : aucune traduction ne s'y
 * applique (le Prisme gouverne le CONTENU des messages, pas les étiquettes
 * qu'on se donne à soi-même).
 */
export type ConversationCategory = {
  readonly id: string;
  readonly name: string;
  readonly order: number;
  readonly isExpanded: boolean;
};

const decodeOne = (raw: unknown): readonly ConversationCategory[] => {
  if (typeof raw !== 'object' || raw === null) return [];
  const entry = raw as Record<string, unknown>;
  const { id, name, order, isExpanded } = entry;
  if (typeof id !== 'string' || id.length === 0) return [];
  if (typeof name !== 'string' || name.trim().length === 0) return [];
  if (typeof order !== 'number' || !Number.isFinite(order)) return [];
  return [{ id, name: name.trim(), order, isExpanded: isExpanded !== false }];
};

const byDeclaredOrder = (a: ConversationCategory, b: ConversationCategory): number => {
  if (a.order !== b.order) return a.order - b.order;
  if (a.id === b.id) return 0;
  return a.id < b.id ? -1 : 1;
};

/** FAIL-CLOSED par entrée : une ligne illisible est écartée, jamais une
 * exception qui viderait toutes les autres. */
export function decodeConversationCategories(raw: unknown): readonly ConversationCategory[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap(decodeOne).sort(byDeclaredOrder);
}

/** Cent : le plafond de pagination de la route (`paginationQuerySchema`,
 * `routes/me/preferences/categories.ts`). Personne ne range ses conversations
 * dans plus de cent tiroirs ; une seule requête suffit. */
const CATEGORIES_LIMIT = 100;

export async function loadConversationCategories(
  params: ConversationsDeps & { readonly signal?: AbortSignal },
): Promise<ApiResult<readonly ConversationCategory[]>> {
  if (__FIXTURES__ && params.source === 'fixtures') return { ok: true, data: FIXTURE_CONVERSATION_CATEGORIES };
  const result = await params.transport.request<unknown>({
    method: 'GET',
    path: `${meEndpoints.categories}?limit=${CATEGORIES_LIMIT}`,
    ...(params.signal !== undefined ? { signal: params.signal } : {}),
  });
  if (!result.ok) return result;
  return { ok: true, data: decodeConversationCategories(result.data) };
}

/**
 * LE PLIAGE D'UNE CATÉGORIE — optimiste (le cache bascule à l'instant du
 * geste), confirmé par `PATCH /me/categories/:id { isExpanded }`, défait sur
 * échec. Rend `true` si l'état posé tient.
 */
export async function setCategoryExpanded(params: {
  readonly client: QueryClient;
  readonly deps: ConversationsDeps;
  readonly id: string;
  readonly isExpanded: boolean;
}): Promise<boolean> {
  const { client, deps, id, isExpanded } = params;
  const before = client.getQueryData<readonly ConversationCategory[]>(CONVERSATION_CATEGORIES_QUERY_KEY);
  client.setQueryData<readonly ConversationCategory[]>(CONVERSATION_CATEGORIES_QUERY_KEY, (current) =>
    current?.map((category) => (category.id === id ? { ...category, isExpanded } : category)),
  );
  if (__FIXTURES__ && deps.source === 'fixtures') return true;
  const result = await deps.transport.request<unknown>({
    method: 'PATCH',
    path: meEndpoints.categoriesByCategoryId(id),
    body: { isExpanded },
  });
  if (result.ok) return true;
  client.setQueryData<readonly ConversationCategory[]>(CONVERSATION_CATEGORIES_QUERY_KEY, (current) =>
    current?.map((category) => (category.id === id ? { ...category, isExpanded: before?.find((c) => c.id === id)?.isExpanded ?? !isExpanded } : category)),
  );
  return false;
}

const NO_CATEGORIES: readonly ConversationCategory[] = [];

/**
 * Le hook de la liste. `enabled` faux (invité, compte anonyme) ⇒ aucune
 * requête, aucune catégorie : les conversations tombent toutes par date.
 * Soixante secondes de fraîcheur — une catégorie change par un geste de
 * l'utilisateur, que la socket (`category:*`) annonce à ses autres appareils.
 */
export function useConversationCategories(deps: ConversationsDeps, enabled: boolean): readonly ConversationCategory[] {
  const query = useQuery({
    queryKey: CONVERSATION_CATEGORIES_QUERY_KEY,
    queryFn: ({ signal }) => loadConversationCategories({ ...deps, signal }).then(unwrap),
    staleTime: 60_000,
    enabled,
  });
  return enabled ? (query.data ?? NO_CATEGORIES) : NO_CATEGORIES;
}
