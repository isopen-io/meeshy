/**
 * **La** loi de vivacité d'un message : ce qu'une relecture a APPRIS de sa vie.
 *
 * Elle vivait en méthode PRIVÉE de `NotificationService` (cycle 127), parce que
 * l'éventail de bannières était alors son seul consommateur. Elle en sort au
 * cycle 140 (#16685) pour une raison qui est le sujet même de ce lot : le
 * chemin de REJEU hors ligne remet bien plus qu'une bannière — le message
 * ENTIER, texte en clair compris — et n'avait aucun équivalent de cette garde.
 *
 * C'est la forme documentée « une garde d'admission se pose sur CHAQUE chemin,
 * pas sur le plus fréquenté » (§ `services/gateway/CLAUDE.md`), et la réponse
 * est l'extraction, jamais une seconde boucle : deux expressions de la même
 * règle divergent au premier cycle qui en touche une.
 *
 * **Le verdict a TROIS états, et les deux derniers s'arbitrent à l'OPPOSÉ.**
 *
 *  - `live` — la ligne a été lue : ni rappelée, ni échue. Servir.
 *  - `gone` — la ligne a été lue et PROUVE le rappel ou l'expiration. Se taire.
 *  - `unknown` — la lecture n'a rien PROUVÉ : elle a levé, ou n'a rendu aucune
 *    ligne. Servir.
 *
 * La distinction `gone` / `unknown` est la leçon du cycle 112 : « la dépendance
 * n'a pas répondu » et « la réponse dit non » sont deux verdicts, et un `catch`
 * qui les confond transforme un hoquet Mongo en silence pour tout un fil.
 * Fail-CLOSED sur la PREUVE, où c'est un secret qui est en jeu ; fail-OPEN sur
 * son ABSENCE, où c'est une livraison — **un message manqué se rattrape, un
 * secret remis non.**
 *
 * **Une ligne ABSENTE est `unknown`, jamais `gone`**, et le dépôt le tenait déjà
 * pour dit : le balayage de rétraction de l'éventail refuse d'agir dessus dans
 * les mêmes termes — « `deletedAt` non nul est la SEULE preuve d'un rappel. Une
 * ligne absente ne prouve rien, et aucun chemin de la gateway ne supprime un
 * message physiquement ». Le mécanisme qui la produit est réel : le message vient
 * d'être committé, et une lecture servie par un secondaire en retard sur le jeu
 * de réplicas rend `null` pour un message parfaitement vivant.
 */
export type MessageLiveness = 'live' | 'gone' | 'unknown';

/**
 * Les deux colonnes que la loi interroge, et elles seules.
 *
 * Tout consommateur doit les `select` — c'est le piège que
 * `utils/recipient-language.ts` documente pour le Prisme, dans les mêmes
 * termes : **le `select` est la seule des conditions qu'aucun témoin de verdict
 * ne peut voir.** Un double Prisma rend ce qu'on lui dit quel que soit le
 * `select`, donc un témoin passe au vert sur un site dont la requête ne ramène
 * pas les colonnes de la loi, et la garde est morte en production.
 */
export const MESSAGE_LIVENESS_SELECT = { deletedAt: true, expiresAt: true } as const;

/** La forme minimale sur laquelle la loi se prononce. */
export type MessageLivenessRow = {
  readonly deletedAt?: Date | null;
  readonly expiresAt?: Date | null;
};

/** Ce qui PROUVE la mort — nommé, parce que les deux causes ne se journalisent pas pareil. */
export type MessageDeathCause = 'soft-deleted' | 'expired';

/**
 * Le verdict, avec sa CAUSE quand il y en a une.
 *
 * La cause n'est pas décorative : elle est la seule chose qui distingue, dans
 * un journal, un message RAPPELÉ par son auteur d'un message ÉCHU par son
 * minuteur — et les deux n'envoient pas chercher au même endroit. Chaque
 * consommateur la journalise dans SA voix (une bannière « skipping
 * notification », un rejeu « queued entry dropped »), ce qui est précisément la
 * raison pour laquelle la loi ne journalise pas elle-même : elle rendrait la
 * voix de son premier appelant à tous les suivants.
 */
export type MessageLivenessVerdict =
  | { readonly liveness: 'live' }
  | { readonly liveness: 'unknown' }
  | { readonly liveness: 'gone'; readonly cause: MessageDeathCause };

/**
 * Le verdict de vie d'une ligne relue. `null` ⇒ `unknown` (cf. ci-dessus).
 *
 * `now` est un PARAMÈTRE, et pas pour la testabilité : un lot qui arbitre
 * plusieurs entrées doit les arbitrer contre le MÊME instant, sans quoi deux
 * entrées de la même rafale peuvent tomber de part et d'autre d'une échéance.
 */
export function messageLivenessOf(
  message: MessageLivenessRow | null | undefined,
  now: Date = new Date(),
): MessageLivenessVerdict {
  if (!message) return { liveness: 'unknown' };
  // `deletedAt` se lit en VÉRACITÉ, `expiresAt` en `instanceof Date` — et
  // l'asymétrie est celle de la méthode d'origine, conservée parce qu'elle est
  // du bon côté dans les deux cas. Un `deletedAt` non nul est une DÉCLARATION
  // de mort quelle que soit sa forme : exiger `instanceof Date` ici
  // relâcherait une garde fail-closed sur la foi d'un détail de
  // désérialisation. Une échéance, elle, doit être COMPARÉE — ce qu'une
  // non-`Date` ne permet pas, et ne rien prouver est alors le fail-open de
  // l'absence de preuve.
  if (message.deletedAt) return { liveness: 'gone', cause: 'soft-deleted' };
  if (message.expiresAt instanceof Date && message.expiresAt.getTime() <= now.getTime()) {
    return { liveness: 'gone', cause: 'expired' };
  }
  return { liveness: 'live' };
}
