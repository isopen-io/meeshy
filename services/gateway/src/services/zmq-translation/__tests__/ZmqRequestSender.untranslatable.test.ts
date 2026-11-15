/**
 * Le translator ne reçoit que ce qu'il peut servir (incident prod 2026-11-01).
 *
 * `ZmqRequestSender.sendTranslationRequest` est le passage OBLIGÉ de toute
 * traduction de texte — messages, posts, stories, légendes, textes alternatifs,
 * sous-titres d'appel, traduction REST directe. Une langue sans code NLLB-200
 * (`byv`… #3659) y est retirée des cibles ; s'il ne reste rien, ou si la
 * SOURCE elle-même est intraduisible, rien ne part et l'appelant l'apprend
 * tout de suite — jamais par un deadman de 30 s relancé cinq fois.
 */

import { describe, it, expect, jest } from '@jest/globals';

jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: {
    child: () => ({ info: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn() }),
  },
}));

import { ZmqRequestSender, UntranslatableRequestError } from '../ZmqRequestSender';
import type { ZmqConnectionManager } from '../ZmqConnectionManager';
import type { TranslationRequest } from '../types';
import { UNSUPPORTED_LANGUAGE_ERROR_CODE } from '../types';

function buildSender() {
  const sent: Array<Record<string, unknown>> = [];
  const connectionManager = {
    send: jest.fn(async (message: Record<string, unknown>) => {
      sent.push(message);
    }),
  } as unknown as ZmqConnectionManager;
  return { sender: new ZmqRequestSender(connectionManager), sent };
}

const request = (overrides: Partial<TranslationRequest>): TranslationRequest => ({
  messageId: 'msg-1',
  text: 'Bonjour à tous',
  sourceLanguage: 'fr',
  targetLanguages: ['en'],
  conversationId: 'conv-1',
  modelType: 'medium',
  ...overrides,
});

describe('ZmqRequestSender ne pousse que des langues traduisibles côté serveur', () => {
  it('retire byv des cibles et pousse les autres', async () => {
    const { sender, sent } = buildSender();

    await sender.sendTranslationRequest(request({ targetLanguages: ['en', 'byv', 'de'] }));

    expect(sent).toHaveLength(1);
    expect(sent[0].targetLanguages).toEqual(['en', 'de']);
  });

  it("garde une langue que NLLB-200 sert hors catalogue (lecteur tn-ZA)", async () => {
    const { sender, sent } = buildSender();

    await sender.sendTranslationRequest(request({ targetLanguages: ['tn-ZA', 'nso', 'byv'] }));

    expect(sent[0].targetLanguages).toEqual(['tn', 'nso']);
  });

  it('ne pousse rien et le dit quand aucune cible ne reste', async () => {
    const { sender, sent } = buildSender();

    await expect(sender.sendTranslationRequest(request({ targetLanguages: ['byv', 'bas'] })))
      .rejects.toBeInstanceOf(UntranslatableRequestError);
    expect(sent).toHaveLength(0);
    expect(sender.getPendingRequestsCount()).toBe(0);
  });

  it('ne pousse rien quand la source est intraduisible', async () => {
    const { sender, sent } = buildSender();

    await expect(sender.sendTranslationRequest(request({ sourceLanguage: 'byv', targetLanguages: ['en'] })))
      .rejects.toBeInstanceOf(UntranslatableRequestError);
    expect(sent).toHaveLength(0);
  });

  it('envoie la source sous la forme canonique que le filtre a jugée', async () => {
    const { sender, sent } = buildSender();

    await sender.sendTranslationRequest(request({ sourceLanguage: 'FR-fr', targetLanguages: ['en'] }));

    // Le translator compare la source BRUTE à LANGUAGE_MAPPINGS : `FR-fr`
    // y serait refusée alors que la passerelle l'a jugée traduisible.
    expect(sent[0].sourceLanguage).toBe('fr');
  });

  it('laisse une source auto à la détection du translator', async () => {
    const { sender, sent } = buildSender();

    await sender.sendTranslationRequest(request({ sourceLanguage: 'auto', targetLanguages: ['en'] }));

    expect(sent).toHaveLength(1);
    expect(sent[0].sourceLanguage).toBe('auto');
  });

  it("annonce au translator qu'elle lit le refus UNSUPPORTED_LANGUAGE", async () => {
    const { sender, sent } = buildSender();

    await sender.sendTranslationRequest(request({ targetLanguages: ['en'] }));

    // Sans cette annonce, un translator récent se tait sur une langue refusée :
    // une passerelle ancienne compterait le refus à son disjoncteur.
    expect(sent[0].acceptsErrorCodes).toEqual([UNSUPPORTED_LANGUAGE_ERROR_CODE]);
  });
});
