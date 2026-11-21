import type { PrismaClient } from '@meeshy/shared/prisma/client';

import { MESSAGE_SIDE_PROTECTION_SELECT, mediaSideContentMayTravel } from './mediaSideContent';

/**
 * **Une pièce protégée ne SERT pas son contenu latéral — et n'en fait pas
 * PRODUIRE** (#20017).
 *
 * `mediaSideContentMayTravel` répond « cette charge a-t-elle le droit de porter
 * la transcription ? ». Ce module pose la question UN CRAN PLUS TÔT, pour un
 * appelant qui veut en FABRIQUER une : `POST /attachments/:id/transcribe`
 * déclenchait Whisper sur un vocal à vue unique, flouté ou éphémère, puis
 * PERSISTAIT le texte obtenu dans `MessageAttachment.transcription`.
 *
 * C'est le défaut du cycle 127 dans sa forme la plus coûteuse : **une
 * compensation en aval ne remplace pas une garde d'admission quand l'effet
 * qu'elle compense est IRRÉVERSIBLE.** Garder la transcription au service
 * (#19978, et les deux portes de ce lot) empêche de la LIRE ; cela ne défait
 * pas le fait qu'elle a été écrite, en clair, dans une colonne que les
 * sauvegardes emportent. La question à poser à tout nettoyage a-posteriori —
 * *que reste-t-il de fait que ce nettoyage ne défait pas ?* — a ici une réponse
 * nette : la colonne.
 *
 * ─── Pourquoi la lecture est FAITE ICI, et pas reçue en paramètre ────────────
 *
 * « Une garde de confidentialité se relit CHEZ ELLE, pas dans ses paramètres »
 * (`services/gateway/CLAUDE.md`) : un paramètre dont l'absence désactive une
 * garde est un demi-correctif, et les appelants de ce chemin construisent
 * chacun leur propre enregistrement de pièce, dont aucun ne porte les sept
 * colonnes du porteur.
 *
 * ─── Fail-CLOSED, à l'inverse de son voisin ──────────────────────────────────
 *
 * Même forme que `serverReadsAttachmentCarrier`, même arbitrage d'erreur : une
 * lecture qui ne conclut pas répond « protégé ». Ce qu'on perd en se trompant
 * dans ce sens est une transcription qu'un `?force=1` relancera ; ce qu'on
 * perdrait dans l'autre est un secret écrit en base.
 *
 * L'UNIQUE cas qui rend `true` sans porteur est la pièce PAS ENCORE RATTACHÉE à
 * un message (`messageId` nul) : il n'y a alors aucun porteur dont la
 * protection pourrait se lire, et c'est ce que `mediaSideContentMayTravel` dit
 * déjà d'un `carrier` nul. Ce n'est pas un repli permissif, c'est l'absence
 * d'une question.
 */
export async function attachmentSideContentIsProducible(
  prisma: Pick<PrismaClient, 'messageAttachment'>,
  attachmentId: string | null | undefined
): Promise<boolean> {
  if (!attachmentId) return false;
  try {
    const piece = await prisma.messageAttachment.findUnique({
      where: { id: attachmentId },
      select: {
        isViewOnce: true,
        isBlurred: true,
        effectFlags: true,
        isEncrypted: true,
        encryptionMode: true,
        message: { select: MESSAGE_SIDE_PROTECTION_SELECT },
      },
    });
    if (!piece) return false;
    return mediaSideContentMayTravel(piece, piece.message ?? null);
  } catch {
    return false;
  }
}
