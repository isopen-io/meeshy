/**
 * #19361 — le mot d'une demande de connexion part au translator à l'envoi, vers
 * les langues du Prisme de son DESTINATAIRE, et revient se ranger sur la ligne.
 *
 * @jest-environment node
 */
import { describe, it, expect, jest } from '@jest/globals';
import { EventEmitter } from 'events';

jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: { child: () => ({ error: jest.fn(), info: jest.fn(), warn: jest.fn(), debug: jest.fn() }) },
}));

import { FriendRequestMessageTranslationService } from '../FriendRequestMessageTranslationService';

const DEMANDE = 'aaaaaaaaaaaaaaaaaaaaaaaa';
const RECEVEUR = '507f1f77bcf86cd799439022';

const zmqDouble = () => Object.assign(new EventEmitter(), {
  translateToMultipleLanguages: jest.fn<any>(async () => 'task-1'),
});

const prismaDouble = (receveur: Record<string, unknown> | null) => ({
  user: { findUnique: jest.fn<any>(async () => receveur) },
  $runCommandRaw: jest.fn<any>(async () => ({ ok: 1, n: 1 })),
});

const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

const monter = (receveur: Record<string, unknown> | null) => {
  const prisma = prismaDouble(receveur);
  const zmq = zmqDouble();
  const service = FriendRequestMessageTranslationService.init(prisma as never, zmq as never);
  return { prisma, zmq, service };
};

describe('#19361 — traduire le mot d’une demande vers le Prisme du destinataire', () => {
  it('demande les langues du destinataire, rangs 1→4, sans la langue d’origine', async () => {
    const { prisma, zmq, service } = monter({ systemLanguage: 'fr', regionalLanguage: 'ar', customDestinationLanguage: null, deviceLocale: 'en-US' });

    await service.trigger({ friendRequestId: DEMANDE, receiverId: RECEVEUR, message: 'التقينا في المهرجان', sourceLanguage: 'ar' });

    expect(prisma.user.findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { id: RECEVEUR } }));
    expect(zmq.translateToMultipleLanguages).toHaveBeenCalledTimes(1);
    const [texte, source, cibles, cible] = zmq.translateToMultipleLanguages.mock.calls[0] as unknown[];
    expect(texte).toBe('التقينا في المهرجان');
    expect(source).toBe('ar');
    expect(cibles).toEqual(['fr', 'en']);
    expect(cible).toBe(`friend-request:${DEMANDE}`);
  });

  it('n’envoie rien quand le destinataire ne lit que la langue d’origine', async () => {
    const { zmq, service } = monter({ systemLanguage: 'ar', regionalLanguage: null, customDestinationLanguage: null, deviceLocale: null });

    await service.trigger({ friendRequestId: DEMANDE, receiverId: RECEVEUR, message: 'مرحبا', sourceLanguage: 'ar' });

    expect(zmq.translateToMultipleLanguages).not.toHaveBeenCalled();
  });

  it('range la traduction reçue sur la ligne de la demande, langue par langue', async () => {
    const { prisma, zmq } = monter(null);

    zmq.emit('translationCompleted', {
      type: 'translation_completed', taskId: 't', targetLanguage: 'fr', timestamp: 0,
      result: { messageId: `friend-request:${DEMANDE}`, translatedText: 'On s’est croisées au festival !', translatorModel: 'nllb', confidenceScore: 0.9 },
    });
    await flush();

    expect(prisma.$runCommandRaw).toHaveBeenCalledTimes(1);
    const commande = JSON.stringify(prisma.$runCommandRaw.mock.calls[0][0]);
    expect(commande).toContain('"update":"FriendRequest"');
    expect(commande).toContain(DEMANDE);
    expect(commande).toContain('messageTranslations');
    expect(commande).toContain('On s’est croisées au festival !');
  });

  it('ignore les traductions d’une autre famille', async () => {
    const { prisma, zmq } = monter(null);

    zmq.emit('translationCompleted', {
      type: 'translation_completed', taskId: 't', targetLanguage: 'fr', timestamp: 0,
      result: { messageId: `media-alt:${DEMANDE}`, translatedText: 'x' },
    });
    await flush();

    expect(prisma.$runCommandRaw).not.toHaveBeenCalled();
  });
});

describe('#19361 — branchement paresseux sur le client ZMQ du processus', () => {
  it('se branche sur ZMQSingleton à la première demande, et une seule fois', async () => {
    const { ZMQSingleton } = await import('../../ZmqSingleton');
    const zmq = zmqDouble();
    const espion = jest.spyOn(ZMQSingleton, 'getInstanceSync').mockReturnValue(zmq as never);
    (FriendRequestMessageTranslationService as unknown as { _shared: unknown })._shared = null;

    const premier = FriendRequestMessageTranslationService.maybeShared(prismaDouble(null) as never);
    const second = FriendRequestMessageTranslationService.maybeShared(prismaDouble(null) as never);

    expect(premier).not.toBeNull();
    expect(second).toBe(premier);
    expect(zmq.listenerCount('translationCompleted')).toBe(1);
    espion.mockRestore();
  });

  it('rend null sans translator joignable', async () => {
    const { ZMQSingleton } = await import('../../ZmqSingleton');
    const espion = jest.spyOn(ZMQSingleton, 'getInstanceSync').mockReturnValue(null);
    (FriendRequestMessageTranslationService as unknown as { _shared: unknown })._shared = null;

    expect(FriendRequestMessageTranslationService.maybeShared(prismaDouble(null) as never)).toBeNull();
    espion.mockRestore();
  });
});
