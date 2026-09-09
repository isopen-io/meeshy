/**
 * LE TRANSPORT — la forme d'un appel vers la passerelle, INJECTABLE.
 *
 * Extrait de `reading-mode/sync.ts` (#5566) où il ne portait qu'un seul
 * domaine. Deux domaines écrivent maintenant vers la passerelle
 * (`reading-mode/sync.ts` et `api/preferences.ts`, #5559 §5.1) : un
 * `Transport` PARTAGÉ est la jumelle de demain qu'un `Transport` par domaine
 * aurait ouverte — directive porteur 2026-09-07 (« cette commodité
 * d'aujourd'hui est-elle la jumelle de demain ? »).
 *
 * La MÉTHODE fait partie du contrat, elle n'est jamais laissée à l'appelant :
 * chaque route citée par ce dépôt est un verbe FIXE (`PUT
 * /user-preferences/conversations/:id`, `POST …/receipts`, `POST
 * …/mark-unread`, `GET /me`) et aucune n'accepte l'autre verbe. Un transport
 * qui ne recevrait que `(path, body)` laisserait le lot `staging` deviner le
 * verbe — c'est-à-dire se tromper une fois sur deux, contre un 404 silencieux.
 *
 * `GET` rejoint `PUT`/`POST` avec le travail `staging` (#5605) : le client
 * HTTP qu'il introduit lit `GET /me` pour la recette manuelle. Le type reste
 * ADDITIF — un ajout futur (`DELETE`, `PATCH`) suit la même règle : jamais
 * avant qu'une route citée l'exige. `DELETE` rejoint le trio avec le retrait
 * d'une réaction (#5814, `DELETE /api/v1/reactions/:messageId/:emoji`,
 * `services/gateway/src/routes/reactions.ts:279-283`) — SANS corps, comme le
 * `body` optionnel ci-dessous le permet déjà.
 *
 * `body` est OPTIONNEL : `POST …/mark-unread` n'a pas de corps
 * (`services/gateway/src/routes/conversations/messages-read-status.ts:159-196`).
 */
export type Transport = (request: {
  readonly method: 'GET' | 'PUT' | 'POST' | 'DELETE';
  readonly path: string;
  readonly body?: unknown;
}) => Promise<unknown>;
