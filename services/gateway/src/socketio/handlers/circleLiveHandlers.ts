/**
 * Les portes socket du DIRECT entre Proches et Sangs (jalon 2 des cercles, #13925) : le
 * talkie (#13935), l'écoute partagée (#13934), le partage temporaire de position (#16980) et la séance « ensemble »
 * (#17012). Un seul site d'enregistrement, pour que
 * le gestionnaire de sockets n'en grossisse pas d'une ligne par feature.
 */
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import type { ServerEmitIOWithRooms } from '../serverEmit';
import { listenNowPlaying, nowPlayingHandlerDeps } from './NowPlayingHandler';
import { listenSharedLocation, sharedLocationHandlerDeps } from './SharedLocationHandler';
import { listenTalkie, talkieHandlerDeps } from './TalkieHandler';
import { listenTogether, togetherHandlerDeps } from './TogetherHandler';

type CircleLiveSocket = Parameters<typeof listenTalkie>[0] & Parameters<typeof listenNowPlaying>[0] & Parameters<typeof listenTogether>[0];

export function listenCircleLive(
  socket: CircleLiveSocket,
  params: {
    readonly prisma: PrismaClient;
    readonly io: ServerEmitIOWithRooms;
    readonly socketToUser: ReadonlyMap<string, string>;
    readonly connectedUsers: ReadonlyMap<string, { readonly isAnonymous: boolean }>;
  },
): void {
  listenTalkie(socket, talkieHandlerDeps(params));
  listenNowPlaying(socket, nowPlayingHandlerDeps(params));
  listenSharedLocation(socket, sharedLocationHandlerDeps(params));
  listenTogether(socket, togetherHandlerDeps(params));
}
