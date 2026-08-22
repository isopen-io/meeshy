import type { PaginationMeta } from '@meeshy/shared/types/api-responses';

/**
 * Lecture d'une réponse `sendPaginatedSuccess` de la passerelle.
 *
 * Deux enveloppes s'empilent sur ce chemin, et c'est ce qui a fait tomber
 * quatre pages de la console d'administration :
 *
 * 1. La passerelle sert `{ success, data: T[], pagination }` — le tableau est
 *    à `data`, et `pagination` est son FRÈRE, pas son enfant.
 * 2. `apiService.request` enveloppe le corps ENTIER dans `.data` et renvoie
 *    `{ success, data: <corps>, message }`.
 *
 * L'appelant doit donc lire `response.data.data` et `response.data.pagination`.
 * Les pages Messages, Communautés, Traductions et Liens de partage lisaient
 * chacune une clé NOMMÉE qui n'a jamais existé (`data.messages`,
 * `data.communities`, …) : la liste sortait vide tandis que le compteur de
 * tête, lu au bon endroit, affichait le vrai total. Une table vide sous un
 * total juste ne ressemble pas à une panne, ce qui explique sa longévité.
 *
 * Ce lecteur est le SEUL endroit qui connaît la forme de cette enveloppe.
 * Les routes qui nichent volontairement leur liste sous une clé nommée
 * (`sendSuccess(reply, { anonymousUsers, pagination })`) ne passent pas par
 * ici — leur forme est différente et légitime.
 */
export function readPaginatedList<T>(response: { data?: unknown }): {
  items: T[];
  pagination?: PaginationMeta;
} {
  const body = response?.data as
    | { data?: unknown; pagination?: PaginationMeta }
    | undefined;

  if (!body || typeof body !== 'object') {
    return { items: [] };
  }

  return {
    items: Array.isArray(body.data) ? (body.data as T[]) : [],
    pagination: body.pagination,
  };
}
