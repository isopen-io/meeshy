import type { Attachment, Message } from '@/lib/api/types';

import { itemsOfKind, type MediaHubAttachmentItem } from './media-hub';

/**
 * LA PELLICULE CONVERSATION-ENTIÈRE, OUVERTE DEPUIS LE FIL (#6303) — miroir de
 * la galerie iOS (`ConversationView+MediaGallery.swift`,
 * `+SourceGrowth.swift`) : TOUS les médias visuels de la conversation, dans
 * l'ordre du FIL (le plus ancien d'abord), ouverte sur la pièce touchée.
 *
 * DEUX SOURCES, UNE LISTE.
 *  - l'index SERVEUR (`?view=media&kinds=visual`, la même requête et la même
 *    clé de cache que l'écran « Médias, liens et documents », D-130), servi du
 *    plus récent au plus ancien — retourné ici ;
 *  - les pièces du message TOUCHÉ, telles que la bulle les montre : elles sont
 *    là dès le geste, index chargé ou non. Un cache froid ouvre donc sur la
 *    pellicule du message (aucune attente), puis la liste GRANDIT autour de la
 *    page ouverte quand l'index arrive — la visionneuse suit la page par son
 *    IDENTITÉ, jamais par sa position (`MediaViewer`, épinglage).
 *
 * Le message touché prend TOUJOURS la version de la bulle (sa copie de
 * l'index peut être plus ancienne : réactions, pièces masquées). La partition
 * est celle de l'index (`itemsOfKind`, D-130) : image et vidéo, vue unique
 * exclue aux deux niveaux — sauf pour le message touché, dont la bulle a déjà
 * décidé ce qu'elle montrait.
 */
export type ThreadMediaEntry = {
  readonly attachment: Attachment;
  readonly message: Message;
};

type Group = { readonly message: Message; readonly pieces: readonly Attachment[] };

const timeOf = (message: Message): number => {
  const raw = message.createdAt as unknown;
  const ms = raw instanceof Date ? raw.getTime() : new Date(String(raw)).getTime();
  return Number.isNaN(ms) ? 0 : ms;
};

export function threadMediaEntriesOf(params: {
  readonly opened: Message;
  /** Les pièces visuelles de la bulle touchée, dans son ordre (`partitionAttachments`). */
  readonly openedVisual: readonly Attachment[];
  /** Les messages de l'index, dans l'ordre SERVI (le plus récent d'abord). */
  readonly indexMessages: readonly Message[];
}): readonly ThreadMediaEntry[] {
  const { opened, openedVisual, indexMessages } = params;
  const indexed: readonly Group[] = [...indexMessages]
    .reverse()
    .filter((message) => message.id !== opened.id)
    .map((message) => ({
      message,
      pieces: (itemsOfKind([message], 'visual') as readonly MediaHubAttachmentItem[]).map((item) => item.attachment),
    }))
    .filter((group) => group.pieces.length > 0);
  const openedGroup: Group = { message: opened, pieces: openedVisual };
  const openedAt = timeOf(opened);
  const before = indexed.filter((group) => timeOf(group.message) <= openedAt);
  const after = indexed.filter((group) => timeOf(group.message) > openedAt);
  return [...before, openedGroup, ...after].flatMap((group) =>
    group.pieces.map((attachment) => ({ attachment, message: group.message })),
  );
}
