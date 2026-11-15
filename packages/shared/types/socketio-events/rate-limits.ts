/**
 * Les budgets d'ACK publiés par le contrat — ce qu'un client doit connaître
 * pour se cadencer, et comment un refus se distingue d'un échec.
 *
 * @see ../socketio-events.ts — la façade qui garde l'adresse historique.
 */

/**
 * Budget serveur de `reaction:request-sync`, par utilisateur.
 *
 * Publié ICI, et non dans le seul `SOCKET_RATE_LIMITS` de la gateway, parce
 * qu'un CLIENT en dépend désormais pour se cadencer : la réconciliation des
 * réactions au retour de la connexion émet une demande par bulle montée, et
 * une bulle ne peut pas savoir combien de voisines partagent le même budget.
 * Un client qui devine ce chiffre le devine faux dès que le serveur le change —
 * exactement la duplication que la règle « single source of truth » interdit.
 *
 * La gateway le consomme dans `SOCKET_RATE_LIMITS.REACTION_SYNC`
 * (`services/gateway/src/utils/socket-rate-limiter.ts`), qui garde son
 * `keyPrefix` : la clé Redis est une affaire de serveur, le budget non.
 */
export const REACTION_SYNC_BUDGET = {
  maxRequests: 120,
  windowMs: 60000,
} as const;

/**
 * Ce que répond un ACK dont le budget est épuisé.
 *
 * Un refus n'est PAS un échec : le serveur a répondu, et il a répondu « pas
 * maintenant ». Un client doit pouvoir les séparer pour ne pas réessayer
 * immédiatement une demande dont la fenêtre n'a pas bougé — un réessai
 * approfondit l'épuisement au lieu de le traverser. La distinction voyage donc
 * dans un littéral PARTAGÉ, jamais dans une prose que chaque client
 * re-devinerait.
 */
export const RATE_LIMIT_REFUSAL_MESSAGE = 'Rate limit exceeded';
