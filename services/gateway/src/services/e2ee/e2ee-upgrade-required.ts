/**
 * Un message chiffré de bout en bout ne se lit qu'avec libsignal (#3706). Le
 * drapeau servi `e2eeUpgradeRequired` permet à un client qui ne le parle pas
 * d'afficher « Mettez à jour Meeshy pour lire ce message » au lieu d'une bulle
 * vide ou du littéral `[Encrypted]` (#9223 : rien ne se perd en silence). Un
 * client libsignal l'ignore : il lit son enveloppe.
 */
export const e2eeUpgradeRequired = (message: { readonly isEncrypted?: boolean | null; readonly encryptionMode?: string | null }): boolean =>
  message.isEncrypted === true && message.encryptionMode === 'e2ee';
