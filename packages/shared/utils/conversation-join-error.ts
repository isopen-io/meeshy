/**
 * Cycle 99 — motifs de refus de `conversation:join`, et la SEULE règle qui
 * décide lesquels autorisent à détruire du cache local.
 *
 * `ConversationHandler.handleConversationJoin` refuse une jonction sur huit
 * sites, portant les sept motifs énumérés ci-dessous. Jusqu'ici l'événement
 * n'était déclaré NULLE PART : ni type de payload, ni entrée dans
 * `ServerToClientEvents`. Ses deux consommateurs l'avaient donc transcrit
 * chacun de son côté en lisant le producteur — et tous deux avaient conclu que
 * l'événement signifiait « tu n'es plus membre », en ignorant `reason` :
 *
 * - web (`use-socket-cache-sync`) retirait la conversation de la liste et
 *   purgeait ses messages en cache ;
 * - iOS (`ConversationSocketHandler`) appelait `handleSocketAccessRevoked`,
 *   qui purge le cache de la conversation ET ferme la vue ouverte sur un
 *   bandeau « accès révoqué ».
 *
 * Quatre des sept motifs sont TRANSITOIRES. Une limite de débit atteinte
 * (30 jonctions/minute, franchie par une tempête de reconnexion qui rejoint
 * toutes les rooms d'un coup), une erreur serveur, une authentification pas
 * encore prête au moment du rejoint, une requête malformée : aucun ne dit quoi
 * que ce soit de l'appartenance. Ils faisaient pourtant disparaître la
 * conversation de la liste sur le web, et éjectaient l'utilisateur du fil qu'il
 * était en train de lire sur iOS.
 *
 * Ce module est la source de vérité unique de cette séparation, partagée par
 * les deux consommateurs TypeScript ; le miroir Swift est
 * `ConversationJoinErrorEvent.isMembershipDenied`
 * (`packages/MeeshySDK/.../MessageSocketManager.swift`) — toute évolution
 * touche les deux.
 */

/**
 * Les sept motifs que la passerelle émet réellement, dans l'ordre où
 * `handleConversationJoin` les rencontre.
 *
 * @see services/gateway/src/socketio/handlers/ConversationHandler.ts
 */
export const CONVERSATION_JOIN_ERROR_REASONS = [
  'invalid_payload',
  'not_authenticated',
  'rate_limited',
  'not_a_member',
  'banned',
  'no_longer_member',
  'server_error',
] as const;

export type ConversationJoinErrorReason = (typeof CONVERSATION_JOIN_ERROR_REASONS)[number];

/**
 * Les seuls motifs qui ÉTABLISSENT la non-appartenance. Liste d'autorisation
 * (allow-list), jamais liste d'exclusion : c'est ce qui fait tomber l'inconnu
 * du bon côté (voir `isMembershipDeniedJoinError`).
 */
const MEMBERSHIP_DENIED_REASONS: ReadonlySet<string> = new Set<ConversationJoinErrorReason>([
  'not_a_member',
  'banned',
  'no_longer_member',
]);

/**
 * `true` seulement si le motif AFFIRME que le lecteur n'est pas membre — le
 * seul cas où un consommateur est fondé à purger le cache local de la
 * conversation, à la retirer de la liste, ou à fermer la vue ouverte.
 *
 * **Un motif inconnu rend `false`.** Deux raisons, et la seconde est la plus
 * importante :
 *
 * 1. Les deux erreurs ne coûtent pas la même chose. Purger à tort détruit des
 *    données locales que rien ne rattrape hors ligne — or l'app doit rester
 *    lisible hors ligne (principe « Offline Graceful Degradation »). Garder à
 *    tort un cache périmé se corrige tout seul au prochain 403 REST.
 * 2. C'est la règle de maison déjà écrite ailleurs dans ce contrat, pour
 *    exactement la même raison : « un pont ILLISIBLE n'est pas un pont ABSENT
 *    — ne pas savoir lire n'autorise pas à détruire » (`BridgeAnnouncement`,
 *    socketio-events.ts). Une passerelle plus récente que le client peut
 *    toujours émettre un motif que celui-ci ne connaît pas ; le client ne doit
 *    pas traduire son ignorance en destruction.
 *
 * Accepte un `string` quelconque, et non le seul type union : la valeur vient
 * du fil, où le typage ne garantit rien.
 */
export function isMembershipDeniedJoinError(reason: string | null | undefined): boolean {
  return reason != null && MEMBERSHIP_DENIED_REASONS.has(reason);
}
