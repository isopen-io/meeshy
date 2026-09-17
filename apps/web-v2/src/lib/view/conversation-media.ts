import type { Attachment } from '../api/types';
import { partitionAttachments } from './media-grid-layout';

/**
 * LES MÉDIAS DE LA CONVERSATION, À PLAT ET DANS L'ORDRE DU FIL (#6303).
 *
 * La visionneuse ne feuillette aujourd'hui que les pièces DU message ouvert
 * (`attachment-blocks.tsx` lui passe `items={visual}`). L'issue demande la
 * conversation entière — parité avec `ConversationMediaGalleryView` d'iOS, qui
 * pagine tout le fil et en montre la pellicule.
 *
 * ## Pourquoi une projection, et pas un registre
 *
 * Il serait tentant de laisser chaque bloc de pièces jointes s'inscrire à son
 * montage : cela ne toucherait qu'un fichier. Mais **le fil est virtualisé** —
 * seule une poignée de rangées est montée à un instant donné. Un registre
 * alimenté au montage verrait la pellicule RÉTRÉCIR et se RÉORDONNER pendant le
 * défilement, ce qui est pire que pas de pellicule du tout.
 *
 * > L'ordre d'une pellicule est celui du FIL, jamais celui du montage. Et son
 * > contenu est ce que le fil a CHARGÉ, jamais ce que le virtualiseur a rendu.
 *
 * La projection prend donc les messages chargés — la liste que `thread.tsx`
 * tient déjà (`mergeTimeline(threadData.messages, pending)`) — et n'a besoin de
 * rien d'autre.
 */

/** Une pièce visuelle du fil, avec le message qui la porte. */
export type MediaOfConversation = {
  /** Le message porteur — moitié de la clé, car un id de pièce n'est unique que par message sur certains chemins. */
  readonly messageId: string;
  readonly attachment: Attachment;
};

/** Ce que la projection exige d'un message : son identité et ses pièces. */
export type MessageWithAttachments = {
  readonly id: string;
  readonly attachments?: readonly Attachment[] | undefined;
};

/**
 * Aplatit les pièces VISUELLES des messages chargés, dans l'ordre du fil.
 *
 * Les pièces MASQUÉES restent à leur position (D-41, #6189) : la visionneuse
 * sait les rendre masquées, et les retirer décalerait tous les index suivants —
 * on ouvrirait alors un autre média que celui touché.
 *
 * Audio et documents restent dehors : la visionneuse ne rend que l'image et la
 * vidéo, et y laisser entrer un vocal ouvrirait une page noire sans contrôle.
 * Le tri du visuel vient de `partitionAttachments`, le MÊME que la grille du
 * fil — deux définitions du « visuel » finiraient par diverger.
 */
export function projectConversationMedia(
  messages: readonly MessageWithAttachments[],
): readonly MediaOfConversation[] {
  const flat: MediaOfConversation[] = [];
  for (const message of messages) {
    const attachments = message.attachments;
    if (attachments === undefined || attachments.length === 0) continue;
    for (const attachment of partitionAttachments(attachments).visual) {
      flat.push({ messageId: message.id, attachment });
    }
  }
  return flat;
}

/**
 * La position, DANS LE FIL, de la pièce qu'on vient de toucher.
 *
 * Le défaut que cette fonction évite : ouvrir la visionneuse sur l'index de la
 * pièce DANS SON MESSAGE. Toucher la première pièce du deuxième message
 * ouvrirait alors la première pièce de la CONVERSATION — un autre média que
 * celui désigné.
 *
 * L'appariement porte sur le COUPLE (message, pièce), jamais sur l'identifiant
 * de pièce seul : il n'est unique que par message sur certains chemins.
 *
 * Introuvable ⇒ `0`, jamais `null` : un média peut disparaître entre le geste
 * et l'ouverture (purge, suppression), et une visionneuse vide serait pire
 * qu'une visionneuse ouverte au début.
 */
export function openingIndexOf(
  media: readonly MediaOfConversation[],
  messageId: string,
  attachmentId: string,
): number {
  const index = media.findIndex(
    (entry) => entry.messageId === messageId && entry.attachment.id === attachmentId,
  );
  return index === -1 ? 0 : index;
}
