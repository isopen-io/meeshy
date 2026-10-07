import { contentExitLaw, type ContentExitAttachment, type ContentExitNature } from '@meeshy/shared/utils/content-exit-law';

import { protectionOf } from '@/lib/reading-mode/protection';

import { quotedIsProtected } from './quoted-protection';
import { SEALED_ROW_ATTRIBUTE } from './sealed-exit-guard';

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
  /**
   * Le contenu est LISIBLE tel quel dans le fil — ni voilé, ni à vue unique,
   * ni supprimé, ni échu. `false` sur tout verdict fermé : une surface qui
   * s'en sert pour dire « protégé » ne peut pas lire un état ouvert à côté
   * d'un verdict qui ne l'est pas (`leaves` implique `readable`).
   */
  readonly readable: boolean;
  readonly forward: ExitForward;
  /** Le contenu peut quitter Meeshy autrement que par un transfert — ni qui disparaît, ni voilé (colonne ou bit), ni chiffré, ni supprimé, ni échu. */
  readonly leaves: boolean;
};

export type ExitPiece = ContentExitAttachment & { readonly isEncrypted?: boolean | null };

type ProtectionSubject = Parameters<typeof protectionOf>[0];

export type ExitMessage = Omit<ProtectionSubject, 'viewOnceCount'> & {
  readonly viewOnceCount?: number;
  readonly isEncrypted?: boolean;
  readonly attachments?: ReadonlyArray<ExitPiece | null | undefined> | null;
};

function masked(carrier: { readonly isViewOnce?: boolean | null; readonly isBlurred?: boolean | null; readonly isEncrypted?: boolean | null; readonly effectFlags?: number | null }): boolean {
  return quotedIsProtected({
    isViewOnce: carrier.isViewOnce === true,
    isBlurred: carrier.isBlurred === true,
    isEncrypted: carrier.isEncrypted === true,
    effectFlags: carrier.effectFlags ?? 0,
  });
}

const UNAVAILABLE: ExitForward = { allowed: false, reason: 'unavailable' };

export function contentExitOf(message: ExitMessage, now: number): ContentExit {
  const law = contentExitLaw(message);
  const kind = protectionOf({ ...message, viewOnceCount: message.viewOnceCount ?? 0 }, now);
  const gone = kind === 'deleted' || kind === 'expired';
  return {
    nature: law.nature,
    readable: kind === 'standard',
    forward: law.forward.allowed && gone ? UNAVAILABLE : law.forward,
    leaves: law.exportable && kind === 'standard' && !masked(message),
  };
}

const SEALED: ContentExit = { nature: 'after-read-flame', readable: false, forward: { allowed: false, reason: 'after-read' }, leaves: false };

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
  return exit.leaves && pieceIsOpen(piece);
}

/** Un média qu'aucun message ne porte (image de commentaire, média de publication) — la loi lue sur la pièce seule. */
export const loosePieceLeaves = (piece: ExitPiece): boolean => contentExitLaw({ attachments: [piece] }).exportable && pieceIsOpen(piece);

/**
 * LE SCEAU D'UNE SURFACE QUI REND UN MESSAGE — le MÊME verdict que les
 * boutons : scellée dès que le contenu ne peut pas sortir (`leaves`), qu'un
 * bit ou le chiffrement le voile, ou que le message CITE un contenu qui ne
 * sort pas (la rangée affiche l'aperçu cité ; une citation dont la nature
 * n'est pas déclarée ferme). `sealed-exit-guard.ts` annule alors les sorties
 * natives du navigateur sur la surface qui porte l'attribut.
 */
export type SealedSubject = ExitMessage & { readonly replyTo?: ExitMessage | null };

export function sealedProps(message: SealedSubject, now: number): { readonly [SEALED_ROW_ATTRIBUTE]?: '' } {
  const quoted = message.replyTo;
  const open = contentExitOf(message, now).leaves && (quoted == null || quotedExitOf(quoted, now).leaves);
  return open ? {} : { [SEALED_ROW_ATTRIBUTE]: '' };
}

/**
 * CE QU'UNE RANGÉE DU FIL MONTRE À UNE CAPTURE (#9617, #9574) — la colonne
 * `capture` de la loi, lue sur ce que la rangée PEINT :
 * - `announced` : un éphémère d'autrui lisible à l'écran (les deux flammes) ;
 *   une capture le déclare, la passerelle l'annonce à la conversation ;
 * - `blocked` : la nature ne se lit pas — champ de protection absent sur le
 *   message d'autrui, ou citation non déclarée (`quotedExitOf`) — et compte
 *   comme une vue unique : la coque Android noircit (`FLAG_SECURE`). Fermé
 *   sur l'inconnu, jamais l'inverse, comme `contentExitLawOfSource` côté serveur ;
 * - `free` : tout le reste. Une vue unique au repos ne montre qu'une puce ;
 *   c'est son OUVERTURE qui tient le bouclier (`ProtectedContent`). Un
 *   message supprimé ou échu ne montre plus rien. Mon propre message
 *   n'annonce rien (la passerelle écarte ses propres messages).
 */
export type RowCapture = 'free' | 'announced' | 'blocked';

export const CAPTURE_ROW_ATTRIBUTE = 'data-capture';

export function captureOf(message: SealedSubject, now: number, viewer: { readonly isMine: boolean }): RowCapture {
  const quoted = message.replyTo;
  if (quoted != null && typeof quoted.effectFlags !== 'number') return 'blocked';
  if (viewer.isMine) return 'free';
  if (typeof message.effectFlags !== 'number') return 'blocked';
  const kind = protectionOf({ ...message, viewOnceCount: message.viewOnceCount ?? 0 }, now);
  if (kind === 'deleted' || kind === 'expired') return 'free';
  return contentExitLaw(message).capture === 'announced' ? 'announced' : 'free';
}

export function captureProps(
  message: SealedSubject,
  now: number,
  viewer: { readonly isMine: boolean },
): { readonly [CAPTURE_ROW_ATTRIBUTE]?: 'announced' | 'blocked' } {
  const capture = captureOf(message, now, viewer);
  return capture === 'free' ? {} : { [CAPTURE_ROW_ATTRIBUTE]: capture };
}
