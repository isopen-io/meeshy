import type { PrismaClient } from '@meeshy/shared/prisma/client';
import {
  resolveForwardSourceBroadcastPayload,
  withoutForwardSourceOrItsPath,
} from '../services/preferences/forward-source-visibility';
import { loadSealedQuoteAudience, sealedQuoteVariant, type QuotedEphemeralSubject } from './quotedEphemeralAudience';

/**
 * Les lecteurs d'une diffusion `message:new` qui ne peuvent PAS recevoir la
 * charge commune de la room, et la charge que chacun reçoit à la place.
 *
 * Deux règles PAR LECTEUR se composent ici, et une seule fois : la
 * réciprocité de la source d'un transfert (un lecteur retiré ne l'apprend pas)
 * et le scellement de la citation d'un éphémère déjà échu pour lui (#8562).
 * Les composer au site d'émission ferait recevoir DEUX `message:new` à un
 * lecteur concerné par les deux — le client insérerait la bulle deux fois.
 *
 * `hiddenRooms` est à exclure de l'émission de room ; chaque clé de
 * `hiddenKeys` reçoit `payloadForKey(clé)` sur sa room personnelle, et la file
 * hors ligne rejoue la même variante (`resolvePayloadForReader`).
 */
export type PeerBroadcastSplit<T> = {
  readonly peerPayload: T;
  readonly hiddenRooms: string[];
  readonly hiddenKeys: ReadonlySet<string>;
  readonly payloadForKey: (key: string) => T;
};

export async function resolvePeerBroadcastSplit<T extends object>(
  prisma: PrismaClient,
  params: {
    readonly senderUserId: string | null;
    readonly sharedParticipants: ReadonlyArray<{ userId: string | null }> | undefined;
    readonly broadcastPayload: T;
    readonly userRoom: (key: string) => string;
    readonly quoted: QuotedEphemeralSubject | null | undefined;
    /** Les clés de l'EXPÉDITEUR, servi par sa propre charge — jamais une seconde fois. */
    readonly senderKeys: ReadonlyArray<string | null | undefined>;
  },
): Promise<PeerBroadcastSplit<T>> {
  const [forward, sealed] = await Promise.all([
    resolveForwardSourceBroadcastPayload(prisma, params),
    loadSealedQuoteAudience(prisma, params.quoted),
  ]);
  const hiddenForward = forward.forwardSourceHiddenUserIds;
  const hiddenKeys = new Set([
    ...hiddenForward,
    ...[...sealed.keys()].filter((key) => !params.senderKeys.includes(key)),
  ]);
  const payloadForKey = (key: string): T =>
    sealedQuoteVariant(
      sealed,
      key,
      hiddenForward.has(key) ? withoutForwardSourceOrItsPath(forward.peerPayload) : forward.peerPayload,
    );
  return {
    peerPayload: forward.peerPayload,
    hiddenRooms: [...hiddenKeys].map(params.userRoom),
    hiddenKeys,
    payloadForKey,
  };
}
