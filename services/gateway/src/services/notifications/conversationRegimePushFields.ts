/**
 * #14669 — le RÉGIME de chiffrement de la conversation, sur le fil d'un message.
 *
 * Le client iOS (`NotificationReplyRegime.pushedModeKeys`) et Android lisent
 * `conversationEncryptionMode` pour décider, sans relire la passerelle, où part
 * une réponse rapide. Le push ne peut qu'AJOUTER le bout en bout côté client :
 * une valeur inconnue y scelle, une valeur absente renvoie à la relecture.
 *
 * La valeur est celle que `GET /conversations/:id` sert (`e2ee`, `server`,
 * `hybrid`), lue dans la relecture de conversation que chaque éventail faisait
 * déjà. Une conversation en clair ne pose AUCUNE clé — jamais `''`, la charge
 * APNs est bornée (`boundApnsPayload`).
 *
 * Ce champ QUALIFIE la bannière sans composer de chaîne (cycle 126) : il ne
 * révèle rien que les membres ne voient déjà, donc il voyage aussi sous
 * `showPreview: false`, comme l'horloge et le verrou de protection.
 */
export type ConversationRegimeField = { conversationEncryptionMode?: string };

export function conversationRegimeField(mode: string | null | undefined): ConversationRegimeField {
  return typeof mode === 'string' && mode.trim().length > 0 ? { conversationEncryptionMode: mode } : {};
}
