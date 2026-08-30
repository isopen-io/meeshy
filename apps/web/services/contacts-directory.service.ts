/**
 * Lecture du carnet d'adresses persisté (`GET /directory/contacts`,
 * `services/gateway/src/routes/directory/contacts.ts`).
 *
 * Le carnet est alimenté par la synchronisation iOS — il peut être vide côté
 * web, ce qui est acceptable. Une erreur réseau, elle, n'est JAMAIS avalée en
 * liste vide ici : contrairement à `searchConversations`
 * (`services/conversations/crud.service.ts`), aucun `try/catch` ne masque un
 * échec derrière un résultat vide indiscernable d'un « aucun résultat ».
 */

import { apiService } from './api.service';

export interface DirectoryContact {
  readonly id: string;
  readonly displayName: string | null;
  readonly isOnMeeshy: boolean;
  readonly matchedUser?: {
    readonly id: string;
    readonly username?: string;
    readonly displayName?: string;
    readonly avatar?: string;
  };
}

export interface ContactsDirectoryListParams {
  /** Identifiant de la dernière ligne de la page précédente. */
  readonly cursor?: string;
  /** 1..100 — la route REFUSE au-delà, elle ne rabote plus en silence. */
  readonly limit?: number;
  readonly filter?: 'all' | 'meeshy' | 'invitable';
  readonly q?: string;
  /** Ne rend que ce qui a changé depuis cet instant (ISO 8601). */
  readonly updatedSince?: string;
}

export interface ContactsDirectoryListResult {
  readonly contacts: readonly DirectoryContact[];
  readonly hasMore: boolean;
  readonly nextCursor: string | null;
}

/**
 * `apiService.get()` renvoie le corps HTTP COMPLET sous `.data`, sans
 * déballage (`services/api.service.ts` : `data = await response.json()` puis
 * `return { success: true, data, message }`). La route répond via
 * `sendPaginatedSuccess` (`services/gateway/src/utils/response.ts`), qui
 * produit `{ success, data: contacts, pagination, meta }` — c'est donc CE
 * second niveau (`response.data.data` / `response.data.pagination`) qu'il
 * faut lire, comme `notification.service.ts` et `dashboard.service.ts`.
 */
interface ContactsDirectoryBody {
  readonly data: DirectoryContact[];
  /**
   * Pagination par CURSEUR (#4163). La forme par décalage repayait un
   * dénombrement complet à chaque page — d'où l'absence de `total` ici : ce
   * n'est pas un oubli, c'est la requête qu'on ne fait plus.
   */
  readonly pagination: { readonly limit: number; readonly hasMore: boolean; readonly nextCursor: string | null };
}

export const contactsDirectoryService = {
  async list(params: ContactsDirectoryListParams = {}): Promise<ContactsDirectoryListResult> {
    const query: Record<string, string | number> = {};
    if (params.cursor !== undefined) query.cursor = params.cursor;
    if (params.limit !== undefined) query.limit = params.limit;
    if (params.filter !== undefined) query.filter = params.filter;
    if (params.q !== undefined) query.q = params.q;
    if (params.updatedSince !== undefined) query.updatedSince = params.updatedSince;

    const response = await apiService.get<ContactsDirectoryBody>('/directory/contacts', query);

    return {
      contacts: response.data?.data ?? [],
      hasMore: response.data?.pagination?.hasMore ?? false,
      nextCursor: response.data?.pagination?.nextCursor ?? null,
    };
  },
};
