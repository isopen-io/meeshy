/**
 * Un refus `UNSUPPORTED_LANGUAGE` du translator est TERMINAL pour SA langue.
 *
 * Incident prod 2026-11-01 : une cible `byv` (Medumba, sans code NLLB-200,
 * #3659) ne recevait aucune réponse ; le client relançait cinq fois en 2,5 min,
 * puis annonçait l'échec, que `MessageTranslationService` diffusait en
 * `translation:failed`. Le translator répond désormais un `translation_error`
 * portant `errorCode` et `targetLanguage` : cette langue se solde sans relance
 * ni échec annoncé — son lecteur reçoit l'original (règle 1 du Prisme) — et
 * les autres langues de la même tâche restent attendues.
 *
 * La passerelle ne pousse plus `byv` (`ZmqRequestSender.untranslatable.test.ts`) ;
 * ce refus reste la défense quand les deux tables divergent — un translator
 * déployé sans une langue que le catalogue partagé croit servie. D'où une
 * langue que la passerelle POUSSE (`es`) dans les cas ci-dessous.
 *
 * Le témoin part de la trame JSON réelle du translator
 * (`TranslationHandler._publish_unsupported_language`) et la fait traverser
 * `ZmqMessageHandler.handleMessage`, jamais un événement fabriqué en aval.
 */

import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';

jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: {
    child: () => ({
      info: jest.fn(),
      debug: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    }),
  },
}));

import { ZmqTranslationClient } from '../ZmqTranslationClient';
import type { ZmqMessageHandler } from '../ZmqMessageHandler';

const MSG_ID = 'msg-refus-1';
const REFUSED = 'es';

type SentMessage = Record<string, unknown>;

function buildClient() {
  const sent: SentMessage[] = [];
  const client = new ZmqTranslationClient();
  const connectionManager = {
    send: jest.fn(async (message: SentMessage) => {
      sent.push(message);
    }),
  };
  Object.assign(client as object, { connectionManager });
  Object.assign((client as unknown as { requestSender: object }).requestSender, { connectionManager });
  return { client, sent };
}

const wire = (client: ZmqTranslationClient, frame: Record<string, unknown>) =>
  (client as unknown as { messageHandler: ZmqMessageHandler }).messageHandler.handleMessage(
    Buffer.from(JSON.stringify(frame), 'utf-8')
  );

const pendingCount = (client: ZmqTranslationClient): number =>
  (client as unknown as { requestSender: { getPendingRequestsCount(): number } }).requestSender.getPendingRequestsCount();

const send = (client: ZmqTranslationClient, targetLanguages: string[]) =>
  client.sendTranslationRequest({
    messageId: MSG_ID,
    text: 'Bonjour à tous',
    sourceLanguage: 'fr',
    targetLanguages,
    conversationId: 'conv-1',
    modelType: 'medium',
  });

const unsupportedFrame = (taskId: string, targetLanguage: string) => ({
  type: 'translation_error',
  taskId,
  messageId: MSG_ID,
  error: `Langue '${targetLanguage}' sans code NLLB-200 (#3659)`,
  errorCode: 'UNSUPPORTED_LANGUAGE',
  targetLanguage,
  conversationId: 'conv-1',
});

const completedFrame = (taskId: string, targetLanguage: string) => ({
  type: 'translation_completed',
  taskId,
  targetLanguage,
  result: {
    messageId: MSG_ID, translatedText: 'Hello everyone', sourceLanguage: 'fr', targetLanguage,
    confidenceScore: 0.95, processingTime: 0.1, modelType: 'medium',
  },
});

beforeEach(() => {
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
});

describe('Un refus UNSUPPORTED_LANGUAGE solde sa langue sans relance', () => {
  it("solde la requête, n'annonce aucun échec et ne renvoie rien", async () => {
    const { client, sent } = buildClient();
    const failures: unknown[] = [];
    client.on('translationError', (e) => failures.push(e));

    const taskId = await send(client, [REFUSED]);
    await wire(client, unsupportedFrame(taskId, REFUSED));
    await jest.advanceTimersByTimeAsync(10 * 60_000);

    expect(pendingCount(client)).toBe(0);
    expect(failures).toHaveLength(0);
    expect(sent).toHaveLength(1);
  });

  it('garde attendues les autres langues de la même tâche, et ne relance que celles-là', async () => {
    const { client, sent } = buildClient();
    const taskId = await send(client, ['en', REFUSED]);

    await wire(client, unsupportedFrame(taskId, REFUSED));
    expect(pendingCount(client)).toBe(1);

    await jest.advanceTimersByTimeAsync(31_000);
    const resend = sent[sent.length - 1] as { taskId: string; targetLanguages: string[] };
    expect(sent.length).toBe(2);
    expect(resend.taskId).toBe(taskId);
    expect(resend.targetLanguages).toEqual(['en']);
  });

  it("la dernière langue rendue solde la tâche : plus aucun renvoi", async () => {
    const { client, sent } = buildClient();
    const taskId = await send(client, ['en', REFUSED]);

    await wire(client, unsupportedFrame(taskId, REFUSED));
    await wire(client, completedFrame(taskId, 'en'));
    await jest.advanceTimersByTimeAsync(10 * 60_000);

    expect(pendingCount(client)).toBe(0);
    expect(sent).toHaveLength(1);
  });

  it("annonce le refus sous son propre nom, pour qui veut l'observer", async () => {
    const { client } = buildClient();
    const refusals: Array<{ taskId: string; targetLanguage: string }> = [];
    client.on('translationUnsupported', (e) => refusals.push(e));

    const taskId = await send(client, [REFUSED]);
    await wire(client, unsupportedFrame(taskId, REFUSED));

    expect(refusals).toEqual([expect.objectContaining({ taskId, messageId: MSG_ID, targetLanguage: REFUSED })]);
  });
});

describe('Ce qui ne change pas', () => {
  it('une erreur sans errorCode reste un échec annoncé et soldé', async () => {
    const { client } = buildClient();
    const failures: unknown[] = [];
    client.on('translationError', (e) => failures.push(e));

    const taskId = await send(client, ['en']);
    await wire(client, { type: 'translation_error', taskId, messageId: MSG_ID, error: 'model unavailable', conversationId: 'conv-1' });

    expect(failures).toHaveLength(1);
    expect(pendingCount(client)).toBe(0);
  });
});
