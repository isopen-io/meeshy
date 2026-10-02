import type { Message } from '@/lib/api/types';
import { protectionOf } from '@/lib/reading-mode/protection';

import { cardAuthorOf, cardHandleOf, cardMediaOf, type MessageCardMediaItem, type MessageCardSubject, type MessageCardSubjectPart } from './message-card-subject';

/**
 * **« IMAGER LA DISCUSSION »** (#9039) — la carte d'Imager étendue aux
 * messages du fil qui MÈNENT au message choisi : le plus ancien en tête
 * (`reply`), les suivants en suites (`followUps`, le bloc que « Imager avec
 * les réponses » d'un commentaire peint déjà, #8734), le message choisi en
 * dernier. Aucun second moteur : la carte, l'atelier et la livraison sont
 * ceux d'un message.
 *
 * MÊMES GARDES QUE LA CARTE D'UN MESSAGE : un message protégé (flouté, vue
 * unique, éphémère échu, supprimé — `protectionOf`) ne se peint pas, et une
 * pièce masquée non plus (`cardMediaOf`). Les mots sont ceux que le lecteur
 * LIT (`servedOf`, le Prisme du fil).
 *
 * LA BORNE — huit messages, quatre médias :
 *  - la carte mesure au plus `CARD_MAX_HEIGHT` = 1920 px et ses suites ne
 *    cèdent jamais leurs trois lignes (`FOLLOW_MAX_LINES`) : à la taille
 *    plancher, une suite coûte ~200 px (méta, trois lignes, écart), si bien
 *    qu'au-delà de huit messages la carte ne ferait que TRONQUER ce qu'on lui
 *    a donné ;
 *  - la mise en page ne peint que quatre pièces visuelles (`MAX_VISUALS`,
 *    `message-card-media.ts`) : en remettre davantage à l'atelier ferait
 *    télécharger et décoder des images que personne ne verra. La mémoire
 *    tenue par une carte reste donc celle de quatre images, quelle que soit la
 *    longueur du fil.
 */
export const DISCUSSION_CARD_MAX_MESSAGES = 8;
const DISCUSSION_CARD_MAX_MEDIA = 4;

type Viewer = { readonly id: string; readonly displayName: string; readonly handle?: string | null };

type Painted = { readonly part: MessageCardSubjectPart; readonly media: readonly MessageCardMediaItem[] };

const createdAtOf = (message: Message): number => new Date(message.createdAt).getTime();

export function discussionCardSubjectOf(params: {
  readonly messages: readonly Message[];
  readonly anchorId: string;
  /** Le texte SERVI d'un message (`servedOf` du menu) — absent : son contenu. */
  readonly servedOf: (messageId: string) => string | undefined;
  readonly viewer: Viewer;
  readonly now: number;
}): MessageCardSubject | null {
  const { viewer, now } = params;
  const ordered = [...params.messages].sort((a, b) => createdAtOf(a) - createdAtOf(b));
  const anchorIndex = ordered.findIndex((message) => message.id === params.anchorId);
  const anchor = ordered[anchorIndex];
  if (anchor === undefined || protectionOf(anchor, now) !== 'standard') return null;

  const painted = ordered.slice(0, anchorIndex + 1).flatMap((message): Painted[] => {
    if (protectionOf(message, now) !== 'standard') return [];
    const text = (params.servedOf(message.id) ?? message.content).trim();
    const media = cardMediaOf(message.attachments);
    if (text === '' && media.length === 0) return [];
    return [{ part: { author: cardAuthorOf(message, viewer), text, handle: cardHandleOf(message, viewer) }, media }];
  });
  const kept = painted.slice(-DISCUSSION_CARD_MAX_MESSAGES);
  const [first, ...rest] = kept;
  if (first === undefined) return null;

  const media = kept
    .flatMap((entry) => entry.media)
    .filter((item, index, all) => all.findIndex((other) => other.id === item.id) === index)
    .slice(0, DISCUSSION_CARD_MAX_MEDIA);
  return {
    quoted: null,
    reply: first.part,
    sentAt: new Date(anchor.createdAt),
    quotedAt: null,
    media,
    followUps: rest.map((entry) => entry.part),
  };
}
