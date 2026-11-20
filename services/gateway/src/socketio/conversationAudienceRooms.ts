import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { ROOMS } from '@meeshy/shared/types/socketio-events';
import { PARTICIPATION_VIVANTE } from '../routes/conversations/utils/access-control';
import { participantUserRooms, type ParticipantRoomTarget } from './emitToConversationParticipants';
import { enhancedLogger } from '../utils/logger-enhanced';

const logger = enhancedLogger.child({ module: 'conversationAudienceRooms' });

/**
 * Une PAGE de lecture, et un LOT d'émission — les deux sont le même nombre, et
 * ce n'est pas une coïncidence : une page lue est une émission faite, donc rien
 * n'est gardé en mémoire plus longtemps que sa propre diffusion.
 *
 * C'était le PLAFOND de #18556 (`LIVE_AUDIENCE_SCAN_CAP`), au-delà duquel
 * l'audience retombait sur la room de conversation seule. Le nombre survit, sa
 * CONSÉQUENCE non : dépasser une page fait lire la suivante.
 */
export const LIVE_AUDIENCE_PAGE = 2000;

/**
 * Le plafond DUR, en pages — 50 000 participants vivants pour une
 * conversation. Au-delà, la lecture s'arrête et le dit (`complete: false`) :
 * les pages lues partent quand même, et la room de conversation avec elles.
 *
 * Il existe parce qu'une boucle de pagination sur une table VIVANTE ne doit pas
 * pouvoir tourner sans fin, pas pour borner un coût : l'enfilage hors ligne de
 * la même mutation relit ces mêmes lignes SANS plafond ni pagination, quelques
 * lignes plus bas dans le même appel (`offlineParticipantQueue`). C'est une
 * dette mesurée, et elle a son issue.
 */
export const LIVE_AUDIENCE_MAX_PAGES = 25;

/**
 * L'audience vivante d'une conversation, en LOTS de la taille d'une page.
 *
 * `complete` dit si la lecture a NOMMÉ toute l'audience. Un `batches` vide veut
 * donc dire deux choses distinctes, et le drapeau est la seule façon de les
 * séparer : `complete: true` ⇒ « il n'y a aucun participant vivant » (une
 * affirmation), `complete: false` ⇒ « la lecture n'a rien prouvé » (une
 * ignorance). La distinction est GRATUITE pour l'émission — les deux replient
 * sur la room de conversation — et elle est la condition pour qu'un jour cette
 * lecture soit PARTAGÉE avec la file hors ligne : là, `[]` vaudrait « aucun
 * participant » et n'enfilerait pour PERSONNE (règle du cycle 116, « `[]` par
 * défaut décide à la place du consommateur »). Tant que ce partage n'est pas
 * fait, aucun appelant n'a le droit de lire `batches` comme un inventaire
 * complet sans regarder `complete`.
 */
export type LiveAudience = {
  readonly batches: ReadonlyArray<ReadonlyArray<ParticipantRoomTarget>>;
  readonly complete: boolean;
};

export type LoadLiveAudienceOptions = {
  readonly onError?: (error: unknown) => void;
  /**
   * Les deux bornes, paramétrables pour qu'un témoin puisse les ATTEINDRE sans
   * fabriquer 50 000 lignes. La production ne les passe jamais : un appelant qui
   * les omet prend celles de ce module.
   */
  readonly page?: number;
  readonly maxPages?: number;
};

/**
 * Les participants VIVANTS d'une conversation, réduits aux deux identités qui
 * nomment une room, lus page par page au CURSEUR (la forme de
 * `userRelationBackfill`) et jamais tous en mémoire à la fois.
 *
 * Ne lève pas. Une lecture qui tombe à la page *n* garde les *n-1* pages
 * qu'elle avait prouvées et rend `complete: false` : la diffusion échoue en
 * donnant MOINS, jamais en ne donnant rien — ces charges ne portent que des
 * ids, donc l'arbitrage est fail-OPEN sur la livraison (CLAUDE.md, « fail-OPEN
 * sur l'absence de preuve, où c'est une livraison »).
 */
export async function loadLiveAudience(
  prisma: Pick<PrismaClient, 'participant'>,
  conversationId: string,
  options?: LoadLiveAudienceOptions,
): Promise<LiveAudience> {
  const page = options?.page ?? LIVE_AUDIENCE_PAGE;
  const maxPages = options?.maxPages ?? LIVE_AUDIENCE_MAX_PAGES;
  const batches: ParticipantRoomTarget[][] = [];
  let cursor: string | null = null;

  for (let read = 0; read < maxPages; read += 1) {
    let rows: ParticipantRoomTarget[];
    try {
      // `page + 1` : la ligne EXCÉDENTAIRE est la sonde « y en a-t-il
      // d'autres ? ». Sans elle, une audience de la taille exacte d'une page
      // paierait une page vide pour l'apprendre.
      rows = (await prisma.participant.findMany({
        where: { conversationId, ...PARTICIPATION_VIVANTE },
        select: { id: true, userId: true },
        orderBy: { id: 'asc' },
        take: page + 1,
        ...(cursor === null ? {} : { cursor: { id: cursor }, skip: 1 }),
      })) as ParticipantRoomTarget[];
    } catch (error) {
      options?.onError?.(error);
      return { batches, complete: false };
    }

    const batch = (rows ?? []).slice(0, page);
    if (batch.length > 0) batches.push(batch);
    if ((rows ?? []).length <= page) return { batches, complete: true };
    cursor = batch[batch.length - 1].id;
  }

  // Le seul cas où une mutation d'id n'atteint pas toute la liste, et il ne se
  // tait plus : c'était la perte SILENCIEUSE que l'audit de #19954 a nommée.
  logger.warn('live audience truncated by page cap', {
    conversationId,
    pages: maxPages,
    named: batches.reduce((total, batch) => total + batch.length, 0),
  });
  return { batches, complete: false };
}

/**
 * La même audience, moins les cibles qu'un prédicat écarte — en gardant la
 * forme en LOTS et le verdict de complétude. Un lot vidé par le filtre
 * disparaît : une émission sans aucune room n'a rien à dire.
 */
export function filterLiveAudience(
  audience: LiveAudience,
  keep: (target: ParticipantRoomTarget) => boolean,
): LiveAudience {
  return {
    batches: audience.batches.map((batch) => batch.filter(keep)).filter((batch) => batch.length > 0),
    complete: audience.complete,
  };
}

/**
 * UNE émission par lot : la room de conversation SUIVIE des rooms personnelles
 * (`userId ?? id`) de la première page, puis une émission par page suivante.
 * Sans aucune cible nommée, la room de conversation seule, sous sa forme de
 * chaîne — le comportement d'avant #18556.
 *
 * ── Ce qu'un lot coûte, et pourquoi c'est le bon arbitrage ───────────────────
 *
 * Socket.IO ne remet un événement qu'une fois par SOCKET pour UNE émission : à
 * un seul lot, un socket présent dans la room de conversation et dans sa room
 * personnelle le reçoit une fois. À plusieurs lots, les lots sont des portées de
 * dédoublonnage DISJOINTES, et ce socket-là le reçoit DEUX fois — une par la
 * room de conversation (premier lot), une par sa room personnelle (lot
 * suivant).
 *
 * C'est assumé, et borné par trois choses : cela n'arrive qu'au-delà de
 * {@link LIVE_AUDIENCE_PAGE} participants VIVANTS ; les cinq familles qui
 * passent par ici ne portent que des IDS (`deleted`, `expired`, `pinned`,
 * `unpinned`, et les deux faits de vue unique), dont l'application est
 * IDEMPOTENTE chez les trois clients — le web l'écrit sur son propre site
 * (`realtime-message-pin.ts` : « Rejouée, l'écriture ne change rien ») ; et ces
 * émissions ne sont pas estampillées par `emitWithSeq`, donc un doublon ne
 * ressemble jamais à un TROU de séquence pour le SyncEngine.
 *
 * L'alternative exacte — émettre les pages avec `.except(conversation:<id>)` —
 * exige d'élargir la porte d'émission (`ServerEmitIO`) à `except` chez ses
 * trois porteurs et chez tous leurs doubles, pour supprimer un doublon
 * idempotent dans une conversation de plus de 2 000 membres. Elle n'est pas
 * écartée, elle est à son prix : une issue à elle.
 */
export function conversationAudienceRoomBatches(
  conversationId: string,
  audience: LiveAudience,
): Array<string | string[]> {
  const conversationRoom = ROOMS.conversation(conversationId);
  if (audience.batches.length === 0) return [conversationRoom];

  return audience.batches.map((batch, index) => {
    const rooms = participantUserRooms(batch, index === 0 ? [conversationRoom] : []);
    return rooms.length === 1 ? rooms[0] : rooms;
  });
}
