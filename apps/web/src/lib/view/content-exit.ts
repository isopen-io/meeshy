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

export type ExitMessage = Parameters<typeof protectionOf>[0] & {
  readonly isEncrypted?: boolean;
  readonly attachments?: ReadonlyArray<ContentExitAttachment | null | undefined> | null;
};

type ExitPiece = ContentExitAttachment & { readonly isEncrypted?: boolean | null };

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

export const exitOffers = (exit: ContentExit, action: ExitAction): boolean => (action === 'forward' ? exit.forward.allowed : exit.leaves);

const masked = (carrier: { readonly isViewOnce?: boolean | null; readonly isBlurred?: boolean | null; readonly isEncrypted?: boolean | null; readonly effectFlags?: number | null }): boolean =>
  quotedIsProtected({
    isViewOnce: carrier.isViewOnce === true,
    isBlurred: carrier.isBlurred === true,
    isEncrypted: carrier.isEncrypted === true,
    effectFlags: carrier.effectFlags ?? 0,
  });

/** Une pièce ne sort pas quand son message ne sort pas, ni quand l'un des deux niveaux est voilé par un bit ou chiffré. */
export const pieceIsOpen = (piece: ExitPiece): boolean => !masked(piece);

export function mediaLeaves(params: { readonly message: ExitMessage; readonly piece: ExitPiece; readonly now: number }): boolean {
  const { message, piece, now } = params;
  return contentExitOf(message, now).leaves && !masked(message) && pieceIsOpen(piece);
}
