/**
 * #17189 — le refus transitoire du translator est un contrat DÉCLARÉ.
 *
 * Le translator le publie quand son pool est saturé ou à son arrêt
 * (`ZmqTranslationHandler._pool_full_error`). La passerelle le reconnaît pour
 * trois décisions : laisser le disjoncteur neutre (#17004), laisser la requête
 * armée pour le renvoi, compter `pool_full_rejections`. Tant qu'il n'était
 * reconnu que par son libellé écrit en dur des deux côtés, un renommage côté
 * Python rouvrait #17004 sans qu'aucun témoin ne tombe.
 *
 * Le contrat se lit désormais dans la SOURCE Python : ce que `_pool_full_error`
 * émet doit être reconnu par `isTransientPoolRefusal`, par son code comme par
 * son libellé historique — une ancienne passerelle ne lit que le second, un
 * translator futur pourra ne plus émettre que le premier.
 */

import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import type { EventEmitter } from 'events';

jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: {
    child: () => ({ info: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn() }),
  },
}));

import { ZmqTranslationClient } from '../ZmqTranslationClient';
import { isTransientPoolRefusal } from '../utils/zmq-helpers';
import {
  LEGACY_POOL_FULL_ERROR,
  TRANSLATION_POOL_FULL_ERROR_CODE,
  UNSUPPORTED_LANGUAGE_ERROR_CODE,
} from '../types';

const HANDLER_SOURCE = resolve(__dirname, '../../../../../../services/translator/src/services/zmq_translation_handler.py');

const pythonSource = (): string => readFileSync(HANDLER_SOURCE, 'utf8');

const poolFullErrorBody = (source: string): string => {
  const start = source.indexOf('def _pool_full_error(');
  if (start < 0) throw new Error('_pool_full_error introuvable dans le handler Python');
  const end = source.indexOf('\n    def ', start + 1);
  return source.slice(start, end < 0 ? undefined : end);
};

const moduleConstant = (source: string, name: string): string => {
  const match = source.match(new RegExp(`^${name}\\s*=\\s*['"]([^'"]+)['"]`, 'm'));
  if (!match) throw new Error(`constante Python ${name} introuvable`);
  return match[1];
};

const emittedField = (source: string, key: string): string | undefined => {
  const match = poolFullErrorBody(source).match(new RegExp(`['"]${key}['"]\\s*:\\s*([^,\\n}]+)`));
  if (!match) return undefined;
  const raw = match[1].trim();
  const literal = raw.match(/^['"]([^'"]*)['"]$/);
  return literal ? literal[1] : moduleConstant(source, raw);
};

describe('Le refus transitoire émis par le translator est celui que la passerelle reconnaît', () => {
  it('le code émis par _pool_full_error est le code déclaré côté passerelle', () => {
    expect(emittedField(pythonSource(), 'errorCode')).toBe(TRANSLATION_POOL_FULL_ERROR_CODE);
  });

  it('le libellé émis reste le libellé historique, que lit une ancienne passerelle', () => {
    expect(emittedField(pythonSource(), 'error')).toBe(LEGACY_POOL_FULL_ERROR);
  });

  it('le code seul, émis par le translator, est reconnu comme refus transitoire', () => {
    const errorCode = emittedField(pythonSource(), 'errorCode');
    expect(isTransientPoolRefusal({ error: 'tout autre libellé', errorCode })).toBe(true);
  });

  it('le libellé seul, émis par le translator, est reconnu comme refus transitoire', () => {
    const error = emittedField(pythonSource(), 'error') ?? '';
    expect(isTransientPoolRefusal({ error })).toBe(true);
  });
});

describe('isTransientPoolRefusal', () => {
  it('reconnaît le code TRANSLATION_POOL_FULL', () => {
    expect(isTransientPoolRefusal({ error: 'renamed', errorCode: 'TRANSLATION_POOL_FULL' })).toBe(true);
  });

  it('reconnaît le libellé historique sans code (ancien translator)', () => {
    expect(isTransientPoolRefusal({ error: 'translation pool full' })).toBe(true);
  });

  it("ne reconnaît pas une erreur ordinaire", () => {
    expect(isTransientPoolRefusal({ error: 'model crashed' })).toBe(false);
  });

  it("ne reconnaît pas un refus terminal UNSUPPORTED_LANGUAGE", () => {
    expect(isTransientPoolRefusal({ error: 'unsupported', errorCode: UNSUPPORTED_LANGUAGE_ERROR_CODE })).toBe(false);
  });
});

const MSG_ID = 'msg-pool-code';
const RENAMED = 'pool saturated';

const buildClient = () => {
  const sent: Record<string, unknown>[] = [];
  const client = new ZmqTranslationClient();
  const internals = client as unknown as {
    connectionManager: unknown;
    requestSender: { connectionManager: unknown; getPendingRequestsCount(): number };
    messageHandler: EventEmitter;
  };
  internals.connectionManager = { send: jest.fn(async (m: Record<string, unknown>) => { sent.push(m); }) };
  internals.requestSender.connectionManager = internals.connectionManager;
  return { client, internals };
};

const sendRequest = (client: ZmqTranslationClient) =>
  client.sendTranslationRequest({
    messageId: MSG_ID,
    text: 'le texte',
    sourceLanguage: 'fr',
    targetLanguages: ['en'],
    conversationId: 'conv-1',
    modelType: 'basic',
  } as never);

const codeOnlyRefusal = (taskId: string) => ({
  taskId,
  messageId: MSG_ID,
  conversationId: 'conv-1',
  error: RENAMED,
  errorCode: TRANSLATION_POOL_FULL_ERROR_CODE,
  metadata: {},
});

describe('Un refus portant SEULEMENT le code (libellé renommé) garde le comportement du refus transitoire', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('laisse la requête armée', async () => {
    const { client, internals } = buildClient();
    const taskId = await sendRequest(client);

    internals.messageHandler.emit('translationError', codeOnlyRefusal(taskId));

    expect(internals.requestSender.getPendingRequestsCount()).toBe(1);
  });

  it('compte pool_full_rejections', async () => {
    const { client, internals } = buildClient();
    const taskId = await sendRequest(client);

    internals.messageHandler.emit('translationError', codeOnlyRefusal(taskId));

    expect(client.getStats().pool_full_rejections).toBe(1);
  });

  it("n'ouvre pas le disjoncteur, même en rafale (arrêt chargé, #17004)", async () => {
    const { client, internals } = buildClient();
    const taskId = await sendRequest(client);

    Array.from({ length: 50 }).forEach(() =>
      internals.messageHandler.emit('translationError', codeOnlyRefusal(taskId)));

    await expect(sendRequest(client)).resolves.toEqual(expect.any(String));
  });
});
