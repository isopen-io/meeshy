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
 Les PIÈCES JOINTES suivent la même règle (#12518). Aucun chemin de la
 * passerelle ne reçoit aujourd'hui un fichier chiffré par l'appareil (#10789) :
 * `uploadEncryptedFile` reçoit le CLAIR puis le chiffre lui-même. Une pièce
 * portée dans une conversation e2ee — rattachée, transférée ou recopiée par une
 * diffusion — est donc une pièce que le serveur a lue, puis qu'il aurait
 * transcrite, traduite et clonée : elle est refusée, sous le MÊME code, que les
 * clients savent déjà dire (« conversation chiffrée de bout en bout »).
 *
 * Ce qui reste admis, et pourquoi :
 * - à côté d'un chiffré, le seul littéral `[Encrypted]` que les clients posent
 *   dans `content` (`validation/encryption-envelope.ts`) — jamais écrit ;
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

import { sharedTranslationServerReadsMessage } from '@meeshy/shared/utils/shared-translation-eligibility';

export const E2EE_PLAINTEXT_REFUSED = 'E2EE_PLAINTEXT_REFUSED';

export const E2EE_PLAINTEXT_REFUSAL_MESSAGE =
  'Cette conversation est chiffrée de bout en bout : le serveur n’accepte aucun message en clair';

export const E2EE_PLAINTEXT_ATTACHMENT_REFUSAL_MESSAGE =
  'Cette conversation est chiffrée de bout en bout : le serveur n’accepte aucune pièce jointe en clair';

/** Le littéral que les clients posent dans `content` quand ils envoient un chiffré. */
export const E2EE_CONTENT_PLACEHOLDER = '[Encrypted]';

/** Le texte en clair que porte un envoi À CÔTÉ de son chiffré : tout, sauf le littéral convenu. */
export const plaintextBesideCiphertext = (content: string | null | undefined): string =>
  content?.trim() === E2EE_CONTENT_PLACEHOLDER ? '' : content ?? '';

/** Le mode arrive avec la casse de son émetteur : iOS écrit « E2EE ». */
export const isEndToEndMode = (mode: string | null | undefined): boolean =>
  typeof mode === 'string' && mode.toLowerCase() === 'e2ee';

/**
 * La LIGNE d'un message porte-t-elle un texte que le serveur ne lit pas ?
 *
 * Le régime COURANT de la conversation ne le dit plus depuis que le chiffrement
 * se désactive (#12522) : un message e2ee d'hier vit dans une conversation
 * repassée en clair, et il reste chiffré à jamais (spec § 5.2, #12881). Même
 * lecture que la traduction partagée : bout en bout, mode inconnu ou ligne
 * chiffrée sans mode ⇒ scellée ; `server` et `hybrid` ⇒ lue par le serveur.
 */
export const messageRowSealedFromServer = (row: {
  readonly isEncrypted: boolean | null | undefined;
  readonly encryptionMode: string | null | undefined;
}): boolean =>
  !sharedTranslationServerReadsMessage({
    conversationEncryptionMode: null,
    messageIsEncrypted: row.isEncrypted,
    messageEncryptionMode: row.encryptionMode,
  });

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

  constructor(message: string = E2EE_PLAINTEXT_REFUSAL_MESSAGE) {
    super(message);
    this.name = 'E2eePlaintextRefusedError';
  }
}

export const isE2eePlaintextRefusal = (error: unknown): error is E2eePlaintextRefusedError =>
  error instanceof E2eePlaintextRefusedError;

/** Lève le refus quand le texte ne peut pas être écrit en clair. */
export function assertPlaintextAdmitted(params: Parameters<typeof plaintextRefusedIn>[0]): void {
  if (plaintextRefusedIn(params)) throw new E2eePlaintextRefusedError();
}

/** Lève le refus quand une conversation e2ee recevrait des pièces que le serveur a lues (#12518). */
export function assertNoPlaintextPieces(params: {
  readonly encryptionMode: string | null | undefined;
  readonly carriedPieceCount: number;
}): void {
  if (isEndToEndMode(params.encryptionMode) && params.carriedPieceCount > 0) {
    throw new E2eePlaintextRefusedError(E2EE_PLAINTEXT_ATTACHMENT_REFUSAL_MESSAGE);
  }
}
