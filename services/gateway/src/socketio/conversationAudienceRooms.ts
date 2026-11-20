import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { ROOMS } from '@meeshy/shared/types/socketio-events';
import { PARTICIPATION_VIVANTE } from '../routes/conversations/utils/access-control';
import { participantUserRooms, type ParticipantRoomTarget } from './emitToConversationParticipants';
import { enhancedLogger } from '../utils/logger-enhanced';

const logger = enhancedLogger.child({ module: 'conversationAudienceRooms' });

/**
 * Le plafond de la lecture — et une BORNE DE MÉMOIRE, pas une borne de requête.
 *
 * C'était 2 000, et dépasser faisait **JETER** l'audience (`return []`) : la
 * diffusion repliait alors sur la room de conversation seule, où un lecteur
 * resté sur la LISTE ne reçoit rien (#20007). Le plafond ne bornait pourtant
 * aucun coût de base — l'enfilage hors ligne de la MÊME mutation relit ces
 * mêmes lignes, même `where`, même `select`, **sans plafond**, quelques lignes
 * plus bas dans le même appel (`offlineParticipantQueue`, dette mesurée :
 * #20020).
 *
 * Ce qu'il borne réellement, c'est ce que ce module tient en mémoire le temps
 * d'une mutation : ~50 000 couples `{ id, userId }` et autant de noms de rooms.
 * Dépasser **TRONQUE en le journalisant** ; la perte d'avant était muette.
 */
export const LIVE_AUDIENCE_SCAN_CAP = 50_000;

/**
 * L'audience vivante d'une conversation, et ce que la lecture a PROUVÉ.
 *
 * `complete` est la seule façon de séparer deux phrases qui sortaient par la
 * même valeur (`[]`) : `complete: true` ⇒ « il n'y a aucun participant vivant »
 * (une affirmation), `complete: false` ⇒ « la lecture n'a pas nommé toute
 * l'audience » (une panne, ou le plafond). La distinction ne change rien à
 * l'émission — les deux replient sur la room de conversation — et elle est la
 * condition pour que cette lecture soit un jour PARTAGÉE avec la file hors
 * ligne (#20020), où `[]` vaudrait « aucun participant » et n'enfilerait pour
 * PERSONNE (règle du cycle 116, « `[]` par défaut décide à la place du
 * consommateur »).
 */
export type LiveAudience = {
  readonly targets: ReadonlyArray<ParticipantRoomTarget>;
  readonly complete: boolean;
};

export type LoadLiveAudienceOptions = {
  readonly onError?: (error: unknown) => void;
  /**
   * Le plafond, paramétrable pour qu'un témoin puisse l'ATTEINDRE sans
   * fabriquer 50 001 lignes. La production ne le passe jamais ; un témoin garde
   * à part le fait que la valeur par défaut est bien celle qui part en requête.
   */
  readonly cap?: number;
};

/**
 * Les participants VIVANTS d'une conversation, réduits aux deux identités qui
 * nomment une room — en UNE lecture bornée, sans tri.
 *
 * ── Pourquoi UNE lecture, et pas des pages ──────────────────────────────────
 *
 * Une pagination au curseur a d'abord été écrite ici, puis retirée par l'audit
 * adversarial du lot : elle exigeait `orderBy: { id: 'asc' }`, qu'AUCUN index de
 * `Participant` ne sert (`@@index([conversationId, isActive])` ne porte pas
 * `_id`). Le moteur aurait donc payé un TRI BLOQUANT sur tous les participants
 * du fil, **par page**, sur un chemin chaud — là où la lecture sans tri se
 * stream depuis l'index et s'arrête au plafond. Elle ajoutait en prime une
 * course : un curseur désigne une LIGNE, et `cleanupExpiredData` supprime
 * physiquement des participants anonymes vivants.
 *
 * Ne lève pas : une lecture qui tombe rend `{ targets: [], complete: false }`,
 * et l'appelant replie sur la room de conversation — jamais sur rien.
 */
export async function loadLiveAudience(
  prisma: Pick<PrismaClient, 'participant'>,
  conversationId: string,
  options?: LoadLiveAudienceOptions,
): Promise<LiveAudience> {
  const cap = options?.cap ?? LIVE_AUDIENCE_SCAN_CAP;
  let rows: ParticipantRoomTarget[];
  try {
    // `cap + 1` : la ligne EXCÉDENTAIRE est la sonde « y en a-t-il d'autres ? »,
    // la seule façon de distinguer une audience de la taille exacte du plafond
    // d'une audience tronquée.
    rows = (await prisma.participant.findMany({
      where: { conversationId, ...PARTICIPATION_VIVANTE },
      select: { id: true, userId: true },
      take: cap + 1,
    })) as ParticipantRoomTarget[];
  } catch (error) {
    options?.onError?.(error);
    return { targets: [], complete: false };
  }

  const read = rows ?? [];
  if (read.length <= cap) return { targets: read, complete: true };

  // Le seul cas où une mutation d'id n'atteint pas toute la liste, et il ne se
  // tait plus : c'était la perte SILENCIEUSE que l'audit de #19954 a nommée.
  logger.warn('live audience truncated by scan cap', { conversationId, cap, named: cap });
  return { targets: read.slice(0, cap), complete: false };
}

/**
 * La même audience, moins les cibles qu'un prédicat écarte — en gardant le
 * verdict de complétude, qui parle de la LECTURE et non du filtre.
 */
export function filterLiveAudience(
  audience: LiveAudience,
  keep: (target: ParticipantRoomTarget) => boolean,
): LiveAudience {
  return { targets: audience.targets.filter(keep), complete: audience.complete };
}

/**
 * La room de conversation SUIVIE des rooms personnelles (`userId ?? id`),
 * dédoublonnées, pour UNE diffusion : Socket.IO ne remet l'événement qu'une
 * fois par socket présent dans plusieurs de ces rooms — et cette garantie n'est
 * vraie que par ÉMISSION, ce qui est la raison de n'en faire qu'une. Sans
 * participant nommé, la room de conversation seule, sous sa forme de chaîne.
 *
 * `ServerEmitIO.to` accepte `string | string[]` depuis le cycle 108 : une
 * audience de 50 000 part donc en un seul appel, dédoublonnée de bout en bout,
 * sans élargir la porte d'émission.
 */
export function conversationAudienceRooms(
  conversationId: string,
  audience: LiveAudience,
): string | string[] {
  const rooms = participantUserRooms(audience.targets, [ROOMS.conversation(conversationId)]);
  return rooms.length === 1 ? rooms[0] : rooms;
}
