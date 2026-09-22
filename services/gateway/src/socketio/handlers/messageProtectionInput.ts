/**
 * Les effets de protection qu'un CLIENT déclare à l'envoi, transmis tels quels
 * — une seule déclaration pour les deux chemins socket.
 *
 * `handleMessageSend` (texte) et `handleMessageSendWithAttachments` (le chemin
 * PRINCIPAL des médias, donc des photos à vue unique, floutées et éphémères)
 * recopiaient le même bloc de cinq champs, chacun sous son propre commentaire.
 * Un bloc retapé à chaque site est un bloc qu'un site finira par ne pas avoir :
 * c'est exactement ce qui s'est produit avant #4885, quand la recherche servait
 * un message à vue unique sans `isViewOnce`.
 *
 * L'extraction est aussi ce qui rend l'ajout de `ephemeralDuration` (#7451)
 * possible sans faire grossir `MessageHandler.ts`, qui pèse le double du budget
 * de 1 200 lignes.
 *
 * Le bitfield final `effectFlags` est recomposé par
 * `MessageProcessor.saveMessage` depuis ces champs bruts — ce module ne décide
 * rien, il transporte.
 */

export interface ClientDeclaredProtectionInput {
  readonly isBlurred?: boolean;
  readonly expiresAt?: string;
  readonly ephemeralDuration?: number;
  readonly effectFlags?: number;
  readonly isViewOnce?: boolean;
  readonly maxViewOnceCount?: number;
}

export interface ClientDeclaredProtection {
  readonly isBlurred?: boolean;
  readonly expiresAt?: Date;
  readonly ephemeralDuration?: number;
  readonly effectFlags?: number;
  readonly isViewOnce?: boolean;
  readonly maxViewOnceCount?: number;
}

export function clientDeclaredProtection(
  validated: ClientDeclaredProtectionInput,
): ClientDeclaredProtection {
  return {
    isBlurred: validated.isBlurred,
    // `expiresAt` reste accepté pour les clients déjà distribués, qui ne
    // savent envoyer qu'une échéance. `MessageProcessor.saveMessage` en DÉRIVE
    // la durée et cesse de l'honorer telle quelle : depuis #7451, une échéance
    // calculée à l'envoi ne décide plus de rien.
    expiresAt: validated.expiresAt ? new Date(validated.expiresAt) : undefined,
    ephemeralDuration: validated.ephemeralDuration,
    effectFlags: validated.effectFlags,
    isViewOnce: validated.isViewOnce,
    maxViewOnceCount: validated.maxViewOnceCount,
  };
}
