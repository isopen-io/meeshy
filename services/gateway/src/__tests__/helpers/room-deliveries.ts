/**
 * Ce que CHAQUE room reçoit d'un événement diffusé en plusieurs chaînes —
 * `emitConversationMemberCountEvent` sert l'effectif aux rooms PERSONNELLES des
 * comptes et une copie SANS effectif à la room du fil (#10205). Un témoin
 * d'audience juge la livraison par room, pas la forme des chaînes.
 *
 * Lève si une room est nommée par deux chaînes : un socket qui y siège
 * recevrait deux copies.
 */
export function roomDeliveries(sends: ReadonlyArray<{ readonly rooms: readonly string[]; readonly payload: unknown }>): Map<string, any> {
  const byRoom = new Map<string, any>();
  for (const send of sends) {
    for (const room of send.rooms) {
      if (byRoom.has(room)) throw new Error(`room ${room} servie par deux chaînes`);
      byRoom.set(room, send.payload);
    }
  }
  return byRoom;
}
