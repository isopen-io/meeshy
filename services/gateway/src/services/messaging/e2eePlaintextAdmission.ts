/**
 * **AUCUN CLAIR DANS UNE CONVERSATION CHIFFRÉE DE BOUT EN BOUT** (directive
 * #9224, #11216) — l'unique énoncé de la règle, pour l'envoi
 * (`MessageProcessor.saveMessage`, point de convergence de REST et du socket),
 * le lien de partage anonyme (`routes/links/messages.ts`, qui contourne ce
 * point) et l'édition (`admitMessageEdit`, ses quatre transports).
 *
 * En mode `e2ee`, le chiffrement est l'affaire de l'appareil : le serveur ne
 * reçoit que `encryptedContent`. Un texte qui arrive SANS chiffré y était
 * jusqu'ici journalisé puis ÉCRIT en clair — la conversation que l'utilisateur
 * croit illisible pour le serveur gardait le message lisible en base. La règle
 * échoue désormais FERMÉE : le texte est refusé, avec un code stable.
 *
 * Ce qui reste admis, et pourquoi :
 * - un message SANS texte (pièces jointes seules) — aucune chaîne en clair
 *   n'est écrite ; le chiffrement des fichiers est un autre chantier ;
 * - les modes `server` et `hybrid` — le serveur y chiffre lui-même ce qu'il
 *   reçoit en clair, c'est leur contrat.
 *
 * Le `messageType` n'exempte RIEN : c'est un champ que le CLIENT déclare
 * (`z.string()` sur le socket et le lien anonyme), et les messages système de
 * la passerelle (avis, résumés d'appel, activation du chiffrement) s'écrivent
 * par `prisma.message.create` direct, sans passer par ici. Exempter « system »
 * offrirait à tout client la porte du clair en le déclarant.
 *
 * Mesure des clients au 2026-10-21 (rétrocompatibilité, #9223) : aucun
 * n'émet `encryptedContent`. Le web ne chiffre pas ; iOS chiffre la directe
 * en `content` + `isEncrypted: true`, forme que `noSilentDowngrade` refuse
 * déjà en 400, et retombe en clair quand la session Signal manque (#8221) —
 * c'est ce repli que la règle refuse.
 */

export const E2EE_PLAINTEXT_REFUSED = 'E2EE_PLAINTEXT_REFUSED';

export const E2EE_PLAINTEXT_REFUSAL_MESSAGE =
  'Cette conversation est chiffrée de bout en bout : le serveur n’accepte aucun message en clair';

/** Le mode arrive avec la casse de son émetteur : iOS écrit « E2EE ». */
export const isEndToEndMode = (mode: string | null | undefined): boolean =>
  typeof mode === 'string' && mode.toLowerCase() === 'e2ee';

/** Le régime de chiffrement d'une conversation, tel que la passerelle le lit. */
export type EncryptionRegime = {
  readonly encryptionMode: string | null;
  readonly encryptionEnabledAt: Date | null;
  readonly serverEncryptionKeyId?: string | null;
};

/**
 * Le texte qu'on s'apprête à écrire en clair est-il refusé ?
 *
 * Le chiffrement d'une conversation s'active une fois pour toutes
 * (`conversation-encryption.ts`), mais un mode `e2ee` sans date d'activation
 * reste refusé : fail-closed, l'anomalie ne rouvre pas le clair.
 */
export const plaintextRefusedIn = (params: {
  readonly encryptionMode: string | null | undefined;
  readonly plaintext: string | null | undefined;
}): boolean => isEndToEndMode(params.encryptionMode) && (params.plaintext?.trim().length ?? 0) > 0;

/**
 * Le refus, porté jusqu'au transport. `MessagingService.handleMessage` le
 * traduit en `{ success: false, error, code }` — REST le sert en 400, le socket
 * dans l'acquittement.
 */
export class E2eePlaintextRefusedError extends Error {
  readonly code = E2EE_PLAINTEXT_REFUSED;

  constructor() {
    super(E2EE_PLAINTEXT_REFUSAL_MESSAGE);
    this.name = 'E2eePlaintextRefusedError';
  }
}

export const isE2eePlaintextRefusal = (error: unknown): error is E2eePlaintextRefusedError =>
  error instanceof E2eePlaintextRefusedError;

/** Lève le refus quand le texte ne peut pas être écrit en clair. */
export function assertPlaintextAdmitted(params: Parameters<typeof plaintextRefusedIn>[0]): void {
  if (plaintextRefusedIn(params)) throw new E2eePlaintextRefusedError();
}
