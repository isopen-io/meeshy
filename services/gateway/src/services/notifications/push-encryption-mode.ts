/**
 * Le mode de chiffrement de la conversation, sur le fil push (#13165).
 *
 * La réponse rapide depuis une bannière s'exécute dans une app réveillée en
 * arrière-plan, qui ne sait du régime que ce que l'appareil a vu. Une
 * conversation passée chiffrée de bout en bout sur un autre appareil pendant
 * que celui-ci dormait n'y est pas connue : le push est la première chose qui
 * le dit. `notificationLocKey` ne suffit pas, car il dit `message.isEncrypted`,
 * chiffrement au repos (`server`, `hybrid`) compris.
 *
 * Le mode ne dit rien du contenu : il voyage aussi sous `showPreview: false`.
 * Clé absente plutôt que vide quand la conversation n'a pas de mode (budget de
 * la charge APNs, `boundApnsPayload`). Rétrocompatible : un champ ajouté, qu'un
 * ancien client ignore.
 */
export interface EncryptionModePushContext {
  readonly conversationEncryptionMode?: string | null;
}

export function encryptionModePushFields(context: EncryptionModePushContext): { encryptionMode?: string } {
  const mode = context.conversationEncryptionMode?.trim();
  return mode ? { encryptionMode: mode } : {};
}
