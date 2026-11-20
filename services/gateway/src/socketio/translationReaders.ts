import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { ROOMS } from '@meeshy/shared/types/socketio-events';
import {
  HISTORY_FLOOR_PARTICIPANT_SELECT,
  loadHistoryFloorsFor,
  type HistoryFloorJoin,
} from '../services/historyFloor';
import { withoutExpiredShareLinks } from '../services/attachments/fileReaderAdmission';
import {
  scanActiveParticipants,
  scanLiveParticipants,
  type LiveParticipantScan,
  type LoadLiveAudienceOptions,
} from './conversationAudienceRooms';
import { enhancedLogger } from '../utils/logger-enhanced';

const logger = enhancedLogger.child({ module: 'TranslationReaders' });

/**
 * QUI peut recevoir la traduction d'un message — la room entière, ses seuls
 * lecteurs autorisés, ou RIEN DE PROUVÉ.
 *
 * `message:translation` partait à toute la room de conversation, et la file hors
 * ligne à tous ses absents, sans regarder le plancher d'historique de personne.
 * Un invité entré par un lien sans historique recevait donc le TEXTE traduit des
 * messages écrits avant lui — dès qu'une traduction de l'un d'eux atterrissait
 * après son arrivée : rattrapage d'une langue nouvelle (#9709), traduction à la
 * demande, ou simple traduction en vol au moment où il entre.
 *
 * Le plancher d'un participant vaut `null`, sa date d'octroi
 * (`historyVisibleFrom`) ou son arrivée (`joinedAt`) — jamais autre chose. Seul
 * un participant arrivé, ou autorisé, APRÈS le message peut donc ne pas avoir le
 * droit de le lire : ce sont les seuls dont le plancher se lit. Le cas nominal —
 * un message neuf — ne coûte qu'une requête qui ne rend rien.
 *
 * FAIL-CLOSED : un plancher illisible exclut le participant ; une date de
 * message inconnue fait lire le plancher de tous, et exclut quiconque en a un.
 * Quand l'audience se restreint, un banni ou un invité au lien échu n'en est pas.
 */
export type TranslationReaders =
  | { readonly kind: 'room' }
  | {
      readonly kind: 'readers';
      /** Les rooms PERSONNELLES des lecteurs autorisés (`userId ?? id`). */
      readonly rooms: readonly string[];
      /** Les clés de file (`userId ?? id`) qui ne doivent RIEN recevoir. */
      readonly excludedQueueKeys: ReadonlySet<string>;
    }
  /**
   * La loi n'a rien prouvé — et c'est une RÉPONSE, pas une panne (#20050).
   *
   * Elle sort quand une des lectures bornées est TRONQUÉE. Les deux listes que
   * cette loi rend ne se dégradent pas dans le même sens : `rooms` tronquée
   * perd une remise, `excludedQueueKeys` tronquée **ouvre une porte** — c'est un
   * COMPLÉMENT (`actifs moins admis`), donc chaque ligne non vue est une
   * personne qu'on cesse d'exclure. Un lecteur sous plancher recevrait alors,
   * dans une file qui la garde 48 h, la traduction d'un message que quatre
   * portes lui refusent.
   *
   * Les appelants la traitent déjà : `deliverTextTranslation` se tait sur les
   * deux canaux, `MessageReadership` la porte depuis #17026, et aucun ne
   * confond « personne n'est bloqué » avec « je ne sais pas qui l'est ».
   */
  | { readonly kind: 'unknown' };

/** Ce que l'appelant peut dire d'une lecture — jamais son `where`, jamais son `take`. */
export type TranslationReadersOptions = {
  /**
   * Le plafond des trois lectures, paramétrable pour qu'un témoin puisse
   * l'ATTEINDRE sans fabriquer 50 001 lignes. La production ne le passe jamais.
   */
  readonly cap?: number;
};

type ReaderRow = {
  readonly id: string;
  readonly userId: string | null;
};

const UNKNOWN = { kind: 'unknown' } as const;
const ROOM = { kind: 'room' } as const;

const queueKeyOf = (participant: ReaderRow): string => participant.userId ?? participant.id;

/**
 * Une lecture bornée dont la PANNE LÈVE encore, et dont la TRONCATURE se dit
 * par le verdict.
 *
 * Les deux sortent du site unique par la même valeur (`complete: false`), et
 * elles ne s'arbitrent pas pareil ici :
 *
 * - une **troncature** est une réponse — la loi rend `unknown`, et le lot
 *   #20050 existe pour ça ;
 * - une **panne** reste une LEVÉE, parce que cinq appelants la NOMMENT par leur
 *   propre `onError` (`messageReadership`, `broadcastMessageMutation`,
 *   `emitAttachmentUpdated`, `messageMentions`, `deliverTextTranslation`). La
 *   remplacer par `unknown` les priverait de leur seul diagnostic : une
 *   traduction définitivement perdue pour les absents ne laisserait qu'un
 *   `warn` d'un module que personne ne regarde.
 */
async function boundedRead<Row>(
  read: (options: LoadLiveAudienceOptions) => Promise<LiveParticipantScan<Row>>,
  scanLabel: string,
  cap: number | undefined,
): Promise<LiveParticipantScan<Row>> {
  const failures: unknown[] = [];
  const scan = await read({
    scanLabel,
    ...(cap === undefined ? {} : { cap }),
    onError: (error) => failures.push(error),
  });
  if (failures.length > 0) throw failures[0];
  return scan;
}

export async function translationReaders(
  prisma: Pick<PrismaClient, 'participant' | 'conversationShareLink'>,
  conversationId: string,
  messageCreatedAt: Date | null,
  now: Date = new Date(),
  options?: TranslationReadersOptions,
): Promise<TranslationReaders> {
  const cap = options?.cap;
  const late = messageCreatedAt
    ? { AND: [{ OR: [{ joinedAt: { gt: messageCreatedAt } }, { historyVisibleFrom: { gt: messageCreatedAt } }] }] }
    : {};
  // La clause de cette lecture est celle de la porte de LECTURE des fichiers
  // (`ADMITTED_FILE_READER_WHERE`), qui EST `PARTICIPATION_VIVANTE` — une
  // affectation directe, gardée par un témoin de ce lot : le jour où les deux
  // divergent, ce site doit être relu, pas suivre en silence.
  const suspectsScan = await boundedRead(
    (scanOptions) =>
      scanLiveParticipants<ReaderRow & HistoryFloorJoin>(
        prisma,
        conversationId,
        { id: true, userId: true, ...HISTORY_FLOOR_PARTICIPANT_SELECT },
        { ...scanOptions, narrow: late },
      ),
    'translation-readers-suspects',
    cap,
  );
  // Une lecture des suspects tronquée fait disparaître des BLOQUÉS : zéro
  // suspect vu vaut « personne n'est sous plancher », donc la room ENTIÈRE
  // servie. C'est la seule des trois dont la troncature élargit l'audience.
  if (!suspectsScan.complete) {
    logger.warn('history floor suspects scan truncated — translation withheld on both channels', { conversationId });
    return UNKNOWN;
  }
  const suspects = suspectsScan.rows;
  if (suspects.length === 0) return ROOM;

  const floors = await loadHistoryFloorsFor(prisma, suspects).catch((error: unknown) => {
    logger.warn('history floors unreadable — late readers excluded from the translation', { conversationId, error });
    return null;
  });

  const blocked = floors === null
    ? suspects
    : suspects.filter((_, index) => {
        const floor = floors[index] ?? null;
        return floor !== null && (messageCreatedAt === null || messageCreatedAt < floor);
      });
  if (blocked.length === 0) return ROOM;

  // Les lecteurs restants passent la porte de LECTURE de la passerelle — actif,
  // jamais banni (absent ou nul), lien d'entrée non échu — celle que jugent déjà
  // la route des fichiers et leur remise temps réel (`fileReaderAdmission`).
  const blockedIds = new Set(blocked.map((participant) => participant.id));
  const [activeScan, admittedScan] = await Promise.all([
    boundedRead(
      (scanOptions) =>
        scanActiveParticipants<ReaderRow>(prisma, conversationId, { id: true, userId: true }, scanOptions),
      'translation-readers-active',
      cap,
    ),
    boundedRead(
      (scanOptions) =>
        scanLiveParticipants<ReaderRow & { readonly shareLinkId?: string | null }>(
          prisma,
          conversationId,
          { id: true, userId: true, shareLinkId: true },
          scanOptions,
        ),
      'translation-readers-admitted',
      cap,
    ),
  ]);
  // L'EXCLUSION est un complément : `actifs moins admis`. Une lecture des
  // ACTIFS tronquée SOUS-exclut — elle n'appauvrit pas une diffusion, elle
  // ouvre un accès durable. Et une lecture des ADMIS tronquée ne peut pas
  // arriver SEULE : les actifs sont un SUR-ENSEMBLE des admis sous le même
  // plafond, donc si les admis débordent, les actifs débordent aussi. Le
  // verdict est donc commun, et il n'y a pas de branche à écrire pour un cas
  // inatteignable.
  if (!activeScan.complete || !admittedScan.complete) {
    logger.warn('reader scan truncated — exclusion set would be incomplete, translation withheld', {
      conversationId,
      activeComplete: activeScan.complete,
      admittedComplete: admittedScan.complete,
    });
    return UNKNOWN;
  }

  const admitted = await withoutExpiredShareLinks(prisma, admittedScan.rows, now);
  const allowed: readonly ReaderRow[] = admitted.filter((participant) => !blockedIds.has(participant.id));
  const allowedIds = new Set(allowed.map((participant) => participant.id));

  return {
    kind: 'readers',
    rooms: [...new Set(allowed.map((participant) => ROOMS.user(queueKeyOf(participant))))],
    excludedQueueKeys: new Set(
      activeScan.rows.filter((participant) => !allowedIds.has(participant.id)).map(queueKeyOf),
    ),
  };
}
