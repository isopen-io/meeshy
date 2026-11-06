/**
 * Le TRANSPORT de `sticker:library-updated` (#16515) : la room personnelle du
 * compte, par la porte typée.
 *
 * Il est séparé du service pour une raison, et une seule : `StickerLibrary`
 * ne connaît ni Fastify ni Socket.IO, et ne doit pas les connaître. Ce qui ne
 * se sépare PAS, c'est l'obligation — elle vit chez l'écrivain unique, qui
 * appelle cette fonction après chaque écriture (cf. `StickerLibrary.tell`).
 *
 * `broadcastToUser` est déjà best-effort et journalise ses deux modes
 * d'échec ; le `try` du site d'appel reste nécessaire pour autant, et son
 * absence ici est volontaire — on ne garde pas deux fois au même endroit.
 */
import type { FastifyInstance } from 'fastify';
import { SERVER_EVENTS } from '@meeshy/shared/types/socketio-events';
import { broadcastToUser } from '../../utils/socket-broadcast';
import type { StickerLibraryAnnounce } from './StickerLibrary';

export function stickerLibraryAnnouncer(fastify: FastifyInstance): StickerLibraryAnnounce {
  return (event) => {
    broadcastToUser(fastify, event.userId, SERVER_EVENTS.STICKER_LIBRARY_UPDATED, event);
  };
}
