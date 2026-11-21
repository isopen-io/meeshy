/**
 * Le retour du translator pour le mot d'une demande (#19361) ne doit pas dépendre
 * d'un envoi servi par CE processus : l'écouteur `translationCompleted` se pose au
 * démarrage de la passerelle, sinon une passerelle redémarrée (ou une autre
 * instance) laisse la traduction tomber sans écouteur, pour toujours.
 *
 * @jest-environment node
 */
import { describe, it, expect, jest } from '@jest/globals';

jest.mock('../../../../utils/logger-enhanced', () => ({
  enhancedLogger: { child: () => ({ error: jest.fn(), info: jest.fn(), warn: jest.fn(), debug: jest.fn() }) },
}));

type Listener = (event: unknown) => void;
const listeners: Listener[] = [];
const zmq = {
  translateToMultipleLanguages: jest.fn<any>().mockResolvedValue(undefined),
  on: (_name: string, listener: Listener) => { listeners.push(listener); },
};
jest.mock('../../../../services/ZmqSingleton', () => ({ ZMQSingleton: { getInstanceSync: () => zmq } }));

const emis: Array<{ room: string; event: string; data: unknown }> = [];
jest.mock('../../../../utils/socket-broadcast', () => ({
  broadcastToUser: (_fastify: unknown, userId: string, event: string, data: unknown) => {
    emis.push({ room: userId, event, data });
    return true;
  },
}));

import { startFriendRequestMessageTranslation } from '../../../../services/friend-requests/FriendRequestMessageTranslationService';

const REQ = '65b0000000000000000000a1';
const RECEIVER = '65b0000000000000000000b2';

describe('le mot d’une demande — écouteur posé au démarrage', () => {
  it('sans AUCUN envoi dans ce processus, une traduction qui revient est rangée et annoncée au destinataire ; un second démarrage ne double pas l’écouteur', async () => {
    const prisma = {
      $runCommandRaw: jest.fn<any>().mockResolvedValue({ n: 1 }),
      friendRequest: { findUnique: jest.fn<any>().mockResolvedValue({ receiverId: RECEIVER }) },
    };
    const fastify = { prisma, log: {} } as never;

    expect(startFriendRequestMessageTranslation(fastify)).not.toBeNull();
    startFriendRequestMessageTranslation(fastify);
    expect(listeners).toHaveLength(1);

    listeners.forEach((l) => l({
      targetLanguage: 'fr',
      result: { messageId: `friend-request:${REQ}`, translatedText: 'On s’est croisées au festival !', confidenceScore: 0.9, translatorModel: 'nllb' },
    }));
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));

    expect(prisma.$runCommandRaw).toHaveBeenCalledTimes(1);
    expect(emis).toEqual([{ room: RECEIVER, event: 'friend-request:updated', data: { friendRequestId: REQ } }]);
  });
});
