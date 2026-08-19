/**
 * Lecture du carnet d'adresses persisté (`GET /users/me/contacts`,
 * `services/gateway/src/routes/users/contacts-directory.ts`).
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
  readonly offset?: number;
  readonly limit?: number;
  readonly filter?: 'all' | 'meeshy' | 'invitable';
  readonly q?: string;
}

export interface ContactsDirectoryListResult {
  readonly contacts: readonly DirectoryContact[];
  readonly hasMore: boolean;
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
  readonly pagination: { readonly offset: number; readonly limit: number; readonly total: number; readonly hasMore: boolean };
}

export const contactsDirectoryService = {
  async list(params: ContactsDirectoryListParams = {}): Promise<ContactsDirectoryListResult> {
    const query: Record<string, string | number> = {};
    if (params.offset !== undefined) query.offset = params.offset;
    if (params.limit !== undefined) query.limit = params.limit;
    if (params.filter !== undefined) query.filter = params.filter;
    if (params.q !== undefined) query.q = params.q;

    const response = await apiService.get<ContactsDirectoryBody>('/users/me/contacts', query);

    return {
      contacts: response.data?.data ?? [],
      hasMore: response.data?.pagination?.hasMore ?? false,
    };
  },
};
