import { contentExitLaw, type ContentExitAttachment, type ContentExitNature } from '@meeshy/shared/utils/content-exit-law';

import { protectionOf } from '@/lib/reading-mode/protection';

import { quotedIsProtected } from './quoted-protection';

/**
 * LA LOI DE SORTIE, PROJETÉE POUR LE WEB (#9573) — « un contenu qui disparaît
 * ne sort pas de Meeshy » (directive porteur 2026-10-07).
 *
 * La règle n'est PAS ici : elle est dans `@meeshy/shared`
 * (`utils/content-exit-law.ts`), que la passerelle applique et qui fait foi.
 * Ce module la lit UNE fois par message et la compose avec ce que le web
 * savait déjà refuser (supprimé, échu, flouté, vue unique, chiffré). Le menu
 * du message, la feuille « Plus… », la barre de sélection, la visionneuse,
 * « Imager », « Imager la discussion » et la feuille d'envoi le consultent :
 * aucune de ces surfaces ne relit un drapeau.
 *
 * | nature | transférer | copier, imager, enregistrer, partager, composer, publier |
 * |---|---|---|
 * | ordinaire | oui | oui |
 * | flamme à durée | oui, durée ≤ source | non |
 * | flamme après lecture | non | non |
 * | vue unique | non | non |
 */

export type ExitAction = 'forward' | 'copy' | 'image' | 'imageDiscussion' | 'save' | 'share' | 'compose' | 'publish';

export const EXIT_ACTIONS: readonly ExitAction[] = ['forward', 'copy', 'image', 'imageDiscussion', 'save', 'share', 'compose', 'publish'];

export type ExitForwardRefusal = 'view-once' | 'after-read' | 'unavailable';

export type ExitForward =
  | { readonly allowed: true; readonly maxDurationSeconds: number | null }
  | { readonly allowed: false; readonly reason: ExitForwardRefusal };

export type ContentExit = {
  readonly nature: ContentExitNature;
  readonly forward: ExitForward;
  /** Le contenu peut quitter Meeshy autrement que par un transfert. */
  readonly leaves: boolean;
};

export type ExitPiece = ContentExitAttachment & { readonly isEncrypted?: boolean | null };

export type ExitMessage = Parameters<typeof protectionOf>[0] & {
  readonly isEncrypted?: boolean;
  readonly attachments?: ReadonlyArray<ExitPiece | null | undefined> | null;
};

const UNAVAILABLE: ExitForward = { allowed: false, reason: 'unavailable' };

export function contentExitOf(message: ExitMessage, now: number): ContentExit {
  const law = contentExitLaw(message);
  const kind = protectionOf(message, now);
  const gone = kind === 'deleted' || kind === 'expired';
  return {
    nature: law.nature,
    forward: law.forward.allowed && gone ? UNAVAILABLE : law.forward,
    leaves: law.exportable && kind === 'standard',
  };
}

const SEALED: ContentExit = { nature: 'after-read-flame', forward: { allowed: false, reason: 'after-read' }, leaves: false };

/**
 * LE VERDICT D'UNE CITATION — FERMÉ quand sa nature n'est pas déclarée.
 *
 * Un message du fil, de l'index des médias ou du temps réel porte toujours
 * `effectFlags` (`mapMessageProtectionFields`, `messageNewPayload`). Une
 * citation, non : reconstruite pour `message:new`, elle ne porte ses champs de
 * protection que si elle est voilée (`servedQuotedMessage`), si bien qu'une
 * flamme citée arrive en clair et sans drapeau. La loi partagée, ouverte sur
 * un champ absent, la jugerait ordinaire ; ici l'absence ferme, comme
 * `contentExitLawOfSource` ferme côté serveur.
 */
export function quotedExitOf(quoted: ExitMessage, now: number): ContentExit {
  return typeof quoted.effectFlags === 'number' ? contentExitOf(quoted, now) : SEALED;
}

export const exitOffers = (exit: ContentExit, action: ExitAction): boolean => (action === 'forward' ? exit.forward.allowed : exit.leaves);

const masked = (carrier: { readonly isViewOnce?: boolean | null; readonly isBlurred?: boolean | null; readonly isEncrypted?: boolean | null; readonly effectFlags?: number | null }): boolean =>
  quotedIsProtected({
    isViewOnce: carrier.isViewOnce === true,
    isBlurred: carrier.isBlurred === true,
    isEncrypted: carrier.isEncrypted === true,
    effectFlags: carrier.effectFlags ?? 0,
  });

/** Une pièce qu'aucun bit ne voile et qui n'est pas chiffrée — le flou et le chiffrement, à composer avec la loi, jamais à sa place. */
export const pieceIsOpen = (piece: ExitPiece): boolean => !masked(piece);

/**
 * UNE PIÈCE OBÉIT AU VERDICT DU MESSAGE ENTIER. La loi est relue sur le
 * message AVEC cette pièce : un hôte qui tient la pièce à côté d'un message
 * servi sans ses pièces (index des médias, citation) ne peut pas la faire
 * juger seule, et un bit que la loi lit sur une pièce (éphémère, après
 * lecture) n'est pas réduit au masque du flou.
 */
export function mediaLeaves(params: {
  readonly message: ExitMessage;
  readonly piece: ExitPiece;
  readonly now: number;
  /** `quote` : le porteur est une citation, dont la nature doit être déclarée (`quotedExitOf`). */
  readonly source?: 'message' | 'quote';
}): boolean {
  const { message, piece, now } = params;
  const whole = { ...message, attachments: [...(message.attachments ?? []), piece] };
  const exit = params.source === 'quote' ? quotedExitOf(whole, now) : contentExitOf(whole, now);
  return exit.leaves && !masked(message) && pieceIsOpen(piece);
}
