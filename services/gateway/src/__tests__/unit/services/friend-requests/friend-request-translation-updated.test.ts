/**
 * Le mot d'une demande traduit APRÈS l'envoi (#19361) : le destinataire dont la
 * liste est déjà ouverte en est prévenu par un signal SANS contenu
 * (`friend-request:updated { friendRequestId }`, à lui seul), et relit la demande
 * par la route qui descend son Prisme. Rien ne part si rien n'a été écrit.
 *
 * @jest-environment node
 */
import { describe, it, expect, jest } from '@jest/globals';

jest.mock('../../../../utils/logger-enhanced', () => ({
  enhancedLogger: { child: () => ({ error: jest.fn(), info: jest.fn(), warn: jest.fn(), debug: jest.fn() }) },
}));

import { FriendRequestMessageTranslationService } from '../../../../services/friend-requests/FriendRequestMessageTranslationService';

const REQ = '65b0000000000000000000a1';
const RECEIVER = '65b0000000000000000000b2';

type Listener = (event: unknown) => void;

function monde(written: number) {
  const listeners: Listener[] = [];
  const zmq = {
    translateToMultipleLanguages: jest.fn<any>().mockResolvedValue(undefined),
    on: (_name: string, listener: Listener) => { listeners.push(listener); },
  };
  const prisma = {
    $runCommandRaw: jest.fn<any>().mockResolvedValue({ n: written }),
    friendRequest: { findUnique: jest.fn<any>().mockResolvedValue({ receiverId: RECEIVER }) },
    user: { findUnique: jest.fn<any>().mockResolvedValue(null) },
  };
  const annonces: Array<{ userId: string; data: unknown }> = [];
  FriendRequestMessageTranslationService.init(prisma as never, zmq as never, (userId, data) => { annonces.push({ userId, data }); });
  const completer = async () => {
    listeners.forEach((l) => l({
      targetLanguage: 'fr',
      result: { messageId: `friend-request:${REQ}`, translatedText: 'On s’est croisées au festival !', confidenceScore: 0.9, translatorModel: 'nllb' },
    }));
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));
  };
  return { prisma, annonces, completer };
}

describe('friend-request:updated — la traduction tardive du mot atteint la liste ouverte', () => {
  it('après une écriture, le DESTINATAIRE seul reçoit un signal sans contenu', async () => {
    const w = monde(1);
    await w.completer();
    expect(w.annonces).toEqual([{ userId: RECEIVER, data: { friendRequestId: REQ } }]);
    expect(JSON.stringify(w.annonces)).not.toContain('festival');
  });

  it('rien d’écrit (demande retirée) : aucun signal', async () => {
    const w = monde(0);
    await w.completer();
    expect(w.annonces).toEqual([]);
  });
});
