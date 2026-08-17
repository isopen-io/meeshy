import type { ConversationBridge } from '@meeshy/shared/types/conversation-bridge';

/**
 * Le champ `bridge` de `conversation:unread-updated` — les DEUX FORMES DE FIL
 * qui expriment les TROIS ÉTATS du contrat (cycle 63).
 *
 * Pourquoi ce module existe : ce champ est recopié AUTORITAIREMENT par les deux
 * clients (`ConversationSyncEngine.handleUnreadUpdated` côté iOS,
 * `use-socket-cache-sync.handleUnreadUpdated` côté web). Un émetteur qui l'omet
 * n'est donc pas muet — il PARLE. Tant que « je n'ai pas calculé » n'avait pas
 * de mot à lui, il empruntait celui de « il n'y en a pas », et le cycle 62 a
 * payé cette confusion par l'effacement du pont sur TOUTES les lignes du
 * lecteur à CHAQUE reconnexion.
 *
 * La règle du carnet (cycle 62 §8) veut qu'on énumère TOUS les émetteurs du
 * même événement dans le même lot. Les voici, et chacun DÉCLARE :
 *
 * | Émetteur | Situation | Déclare |
 * |----------|-----------|---------|
 * | `emitUnreadCountsToRecipients` | compteur à zéro (contrat gelé §3.2) | `bridgeComputed(undefined)` |
 * | `emitUnreadCountsToRecipients` | la passe a tourné | `bridgeComputed(...)` |
 * | `emitUnreadCountsToRecipients` | la passe a ÉCHOUÉ, ou aucun service | `bridgeNotComputed()` |
 * | `MeeshySocketIOManager._emitUnreadCountsSnapshot` | conversation soumise à la passe | `bridgeComputed(...)` |
 * | `MeeshySocketIOManager._emitUnreadCountsSnapshot` | AU-DELÀ de la borne, ou passe échouée | `bridgeNotComputed()` |
 * | `ConversationHandler` (sur `conversation:join`) | on ouvre pour LIRE : le pont est consommé | `bridgeComputed(undefined)` |
 * | `broadcastReadStatus` | le lecteur vient de lire : l'ancien pont est VOID | `bridgeComputed(undefined)` |
 *
 * Le seul état qui EFFACE est celui qu'on écrit en connaissance de cause. Un
 * émetteur futur qui ne sait rien du pont ne peut plus détruire par omission.
 */

/**
 * « J'AI CALCULÉ. » Le pont trouvé part tel quel ; l'absence de pont part comme
 * un `null` EXPLICITE, qui ordonne l'effacement.
 *
 * `undefined` en entrée n'est pas une hésitation : c'est le résultat normal
 * d'une passe qui a tourné et n'a rien à annoncer pour ce lecteur — compteur à
 * zéro, fenêtre ne contenant que les messages du lecteur lui-même (BLOCAGE 5),
 * ou conversation absente du Map de retour. Ces cas SAVENT qu'il n'y a pas de
 * pont, et le disent.
 */
export function bridgeComputed(
  bridge: ConversationBridge | null | undefined
): { readonly bridge: ConversationBridge | null } {
  return { bridge: bridge ?? null };
}

/**
 * « JE N'AI PAS CALCULÉ. » Le champ ne part pas du tout, et le client garde le
 * pont qu'il a déjà.
 *
 * Réservé aux émetteurs qui n'ont pas SOUMIS la conversation à la passe (borne
 * de l'instantané de reconnexion) ou dont la passe est tombée. La posture
 * best-effort du pont est ainsi enfin tenue de bout en bout : jusqu'ici, une
 * passe qui échouait ne privait certes personne de sa pastille — mais elle
 * détruisait le pont de tout le monde au passage.
 */
export function bridgeNotComputed(): Record<string, never> {
  return {};
}
