/**
 * `healthCheck()` — le chemin d'ÉCHEC, celui pour lequel une sonde de santé existe.
 *
 * Ce fichier garde une AFFIRMATION, pas seulement un comportement. Jusqu'à #7697,
 * le `catch` de `healthCheck()` portait une annotation déclarant que
 * « connectionManager.sendPing() catches internally; this outer catch is
 * structurally unreachable ».
 *
 * La prémisse était fausse : `ZmqConnectionManager.sendPing()` attrape,
 * journalise, puis RELANCE. Le `catch` de l'appelant est donc le chemin NOMINAL
 * d'un ping ZMQ qui échoue — et il était exclu de la couverture sur cette
 * fausse promesse, sous un commentaire enseignant que `healthCheck()` ne peut
 * pas rendre `false`.
 *
 * Les trois témoins se lisent ensemble :
 *
 *  1. LA PRÉMISSE — `sendPing()` relance. C'est elle qu'aucune annotation ne
 *     pouvait rendre falsifiable. Si quelqu'un fait un jour avaler l'erreur au
 *     gestionnaire de connexion, ce témoin tombe, et l'exclusion redeviendrait
 *     légitime. Une affirmation d'inatteignabilité sans témoin ne rougit jamais.
 *  2. LA CONSÉQUENCE — `healthCheck()` rend `false`, exercée à travers un VRAI
 *     client. Doubler `healthCheck` n'atteste rien : c'est l'unité sous test.
 *  3. Le cas nominal, pour que la paire ne puisse pas passer au vert en rendant
 *     `false` pour tout le monde.
 *
 * Preuve du ROUGE (2026-09-24) : en retirant le `throw error;` de
 * `ZmqConnectionManager.sendPing` — c'est-à-dire en rendant VRAIE la prémisse de
 * l'annotation — les témoins 1 et 2 tombent, le 3 reste vert.
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';

const mockPushSocket = {
  connect: jest.fn(),
  send: jest.fn(),
  close: jest.fn()
};

const mockSubSocket = {
  connect: jest.fn(),
  subscribe: jest.fn(),
  receive: jest.fn(),
  close: jest.fn()
};

jest.mock('zeromq', () => ({
  Push: jest.fn().mockImplementation(() => mockPushSocket),
  Subscriber: jest.fn().mockImplementation(() => mockSubSocket),
  Context: jest.fn().mockImplementation(() => ({}))
}));

import { ZmqTranslationClient } from '../../../services/ZmqTranslationClient';
import {
  ZmqConnectionManager,
  type ConnectionManagerConfig
} from '../../../services/zmq-translation/ZmqConnectionManager';

const CONFIG: ConnectionManagerConfig = { host: '0.0.0.0', pushPort: 5555, subPort: 5558 };

describe('ZmqTranslationClient.healthCheck — le ping qui échoue', () => {
  let client: ZmqTranslationClient;

  beforeEach(async () => {
    jest.clearAllMocks();
    // Timers faux comme chez le témoin voisin (`ZmqTranslationClient.gap.test.ts`) :
    // le client arme un `setInterval` de polling à l'initialisation, et une horloge
    // réelle le laisse tourner après la suite.
    jest.useFakeTimers();

    process.env.ZMQ_TRANSLATOR_HOST = CONFIG.host;
    process.env.ZMQ_TRANSLATOR_PUSH_PORT = String(CONFIG.pushPort);
    process.env.ZMQ_TRANSLATOR_SUB_PORT = String(CONFIG.subPort);

    (mockPushSocket.connect as jest.Mock).mockResolvedValue(undefined);
    (mockPushSocket.send as jest.Mock).mockResolvedValue(undefined);
    (mockPushSocket.close as jest.Mock).mockResolvedValue(undefined);
    (mockSubSocket.connect as jest.Mock).mockResolvedValue(undefined);
    (mockSubSocket.subscribe as jest.Mock).mockResolvedValue(undefined);
    (mockSubSocket.close as jest.Mock).mockResolvedValue(undefined);
    (mockSubSocket.receive as jest.Mock).mockRejectedValue(new Error('No message'));

    client = new ZmqTranslationClient();
    await client.initialize();
  });

  afterEach(async () => {
    try { await client.close(); } catch { /* le client est déjà arrêté */ }
    jest.useRealTimers();
  });

  it('LA PRÉMISSE — sendPing() relance l\'erreur du socket, il ne l\'avale pas', async () => {
    const manager = new ZmqConnectionManager(CONFIG);
    await manager.initialize();
    (mockPushSocket.send as jest.Mock).mockRejectedValueOnce(new Error('ZMQ push failed'));

    await expect(manager.sendPing()).rejects.toThrow('ZMQ push failed');

    await manager.close();
  });

  it('LA CONSÉQUENCE — healthCheck() rend false quand le ping échoue', async () => {
    (mockPushSocket.send as jest.Mock).mockRejectedValueOnce(new Error('ZMQ push failed'));

    await expect(client.healthCheck()).resolves.toBe(false);
  });

  it('et rend true quand le ping passe', async () => {
    await expect(client.healthCheck()).resolves.toBe(true);
  });
});
