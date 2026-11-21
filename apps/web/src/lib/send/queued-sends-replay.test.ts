import { describe, expect, test } from 'bun:test';

import { SERVER_EVENTS } from '@meeshy/shared/types/socketio-events/event-names';

import type { SocketClient } from '../net/socket';

import { bindQueuedSendsReplay } from './queued-sends-replay';

/**
 * #20224 — un socket qui se rouvre rejoue les envois en file.
 *
 * Le défaut ne se voit QUE sur la seconde authentification : la première est
 * couverte par le lancement (`startOutboxDurability`). C'est le redémarrage de
 * la PASSERELLE qui n'a aucun déclencheur — le réseau de l'appareil ne bouge
 * pas, donc `online` ne se lève jamais.
 */
function fauxSocket() {
  const handlers = new Map<string, Set<(payload: unknown) => void>>();
  const socket = {
    connected: true,
    connect: () => undefined,
    disconnect: () => undefined,
    on: (event: string, handler: (payload: unknown) => void) => {
      const set = handlers.get(event) ?? new Set();
      set.add(handler);
      handlers.set(event, set);
    },
    off: (event: string, handler: (payload: unknown) => void) => {
      handlers.get(event)?.delete(handler);
    },
    emit: () => undefined,
  } as unknown as SocketClient;
  const fire = (event: string) => handlers.get(event)?.forEach((handler) => handler(undefined));
  const compte = (event: string) => handlers.get(event)?.size ?? 0;
  return { socket, fire, compte };
}

describe('#20224 — la (ré)authentification du temps réel rejoue les envois en file', () => {
  test('chaque authentification rejoue la file — la DEUXIÈME est celle qu’aucun déclencheur ne couvrait', () => {
    const { socket, fire } = fauxSocket();
    let rejeux = 0;

    bindQueuedSendsReplay({ socket, flush: () => { rejeux += 1; } });

    fire(SERVER_EVENTS.AUTHENTICATED);
    expect(rejeux).toBe(1);

    // La passerelle a redémarré : la socket se rouvre, le réseau n'a pas bougé.
    fire(SERVER_EVENTS.AUTHENTICATED);
    expect(rejeux).toBe(2);
  });

  test('le branchement se DÉTACHE : une connexion quittée ne rejoue plus rien', () => {
    const { socket, fire, compte } = fauxSocket();
    let rejeux = 0;

    const unbind = bindQueuedSendsReplay({ socket, flush: () => { rejeux += 1; } });
    unbind();

    expect(compte(SERVER_EVENTS.AUTHENTICATED)).toBe(0);
    fire(SERVER_EVENTS.AUTHENTICATED);
    expect(rejeux).toBe(0);
  });
});
