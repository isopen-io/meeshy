import { jest } from '@jest/globals';

/**
 * Double de `io` qui CHAÎNE, et qui retient la chaîne de chaque émission.
 *
 * Deux raisons, et la seconde est la moins évidente :
 *
 * 1. **La forme de production chaîne.** `emitToConversationParticipants` écrit
 *    `io.to(a).to(b).emit(...)` pour ne livrer qu'UNE copie par socket. Un
 *    double dont `.to()` rend `{ emit }` sans `.to` plante au second maillon —
 *    et un double qui casse sur la forme réelle décrit un autre programme que
 *    celui qu'on livre.
 * 2. **`expect(io.to).toHaveBeenCalledWith(room)` ne prouve pas la livraison.**
 *    Il dit qu'une room a été nommée quelque part, jamais qu'elle appartenait à
 *    la chaîne qui a émis CET événement, ni quel payload y a atterri. Or c'est
 *    exactement la propriété qu'une diffusion « par destinataire » revendique.
 *
 * Reprend `recordEmitChains` (MessageHandler.core.test.ts,
 * MeeshySocketIOManager.test.ts), en fournissant cette fois l'objet `io` complet
 * plutôt qu'en réécrivant le `.to` d'un double existant.
 */
export function makeChainableIO(options: { sockets?: Array<{ leave: (room: string) => void }> } = {}) {
  const sent: Array<{ rooms: string[]; event: string; payload: unknown }> = [];
  const leave = jest.fn<any>();
  const fetchSockets = jest.fn<any>().mockResolvedValue(options.sockets ?? [{ leave }]);
  const emit = jest.fn<any>();

  const chain = (rooms: string[]): any => ({
    to: (room: string) => chain([...rooms, room]),
    except: () => chain(rooms),
    emit: (event: string, payload: unknown) => {
      sent.push({ rooms, event, payload });
      emit(event, payload);
    },
  });

  const io = {
    to: jest.fn<any>((room: string) => chain([room])),
    in: jest.fn<any>().mockReturnValue({ fetchSockets }),
    _emit: emit,
    _leave: leave,
    _fetchSockets: fetchSockets,
    _sent: sent,
    /** Toutes les rooms des chaînes qui ont émis cet événement. */
    _roomsFor: (event: string) => sent.filter((s) => s.event === event).flatMap((s) => s.rooms),
    /** Le payload de la première émission de cet événement. */
    _payloadFor: (event: string) => sent.find((s) => s.event === event)?.payload as any,
    /** Index de l'émission dans l'ordre global — pour prouver un ORDRE. */
    _indexOf: (event: string) => sent.findIndex((s) => s.event === event)
  };

  return io;
}
