/**
 * **UNE CLÉ D'IDEMPOTENCE APPARTIENT À SON AUTEUR** (#19960).
 *
 * `clientMessageId` est tiré par le client dans SON espace d'ids optimistes
 * (`cid_<uuid v4>`, `packages/shared/utils/client-message-id.ts`). L'unicité
 * que la base garde est pourtant celle du COUPLE `(conversationId,
 * clientMessageId)` — un index partiel MongoDB, posé par migration manuelle —
 * donc un espace de noms PARTAGÉ par tous les participants d'une conversation.
 *
 * Les deux ne coïncident pas, et le chemin socket l'avait déjà tranché dans
 * l'autre sens : `stripClientMessageId` (#16689) retire la clé de la charge
 * des PAIRS, « so a non-sender participant never learns the sender's
 * optimistic-id space ». La liste REST, elle, la servait à tout le monde.
 *
 * Ce module porte la règle que les trois relectures de dédoublonnage
 * partagent : **un rejeu est un rejeu de SON auteur.** Une ligne qui porte la
 * clé sous un AUTRE expéditeur n'est pas un doublon — c'est une collision dans
 * l'espace partagé, et la servir détruit le message de l'appelant en lui
 * répondant « envoyé ».
 */
