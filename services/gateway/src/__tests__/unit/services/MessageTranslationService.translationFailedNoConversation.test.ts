import { describe, it, expect, beforeEach } from '@jest/globals';
import { EventEmitter } from 'events';
import type { TranslationErrorPayload } from '../../../services/zmq-translation/types';

class FakeZmqClient extends EventEmitter {
  sendTranslationRequest = jest.fn();
  healthCheck = jest.fn();
  close = jest.fn();
  testReception = jest.fn();
}

const fakeZmqClient = new FakeZmqClient();

jest.mock('../../../services/ZmqSingleton', () => ({
  ZMQSingleton: { getInstance: jest.fn().mockResolvedValue(fakeZmqClient) }
}));

jest.mock('fs', () => ({
  promises: {
    mkdir: jest.fn().mockResolvedValue(undefined),
    writeFile: jest.fn().mockResolvedValue(undefined),
    readFile: jest.fn().mockResolvedValue(Buffer.from('')),
    unlink: jest.fn().mockResolvedValue(undefined),
    stat: jest.fn().mockResolvedValue({ size: 0 })
  },
  existsSync: jest.fn().mockReturnValue(false),
  readFileSync: jest.fn()
}));

import { MessageTranslationService } from '../../../services/message-translation/MessageTranslationService';

const MESSAGE_ID = '507f1f77bcf86cd799439011';
const CONVERSATION_ID = '507f1f77bcf86cd799439022';

const translationError = (overrides: Partial<TranslationErrorPayload> = {}): TranslationErrorPayload => ({
  taskId: 'task-1',
  messageId: MESSAGE_ID,
  error: 'translation failed',
  conversationId: CONVERSATION_ID,
  metadata: {},
  ...overrides
});

const flushAsync = () => new Promise<void>(resolve => setImmediate(resolve));

const startedService = async () => {
  fakeZmqClient.removeAllListeners();
  const service = new MessageTranslationService({} as never);
  await service.initialize();
  const failures: unknown[] = [];
  service.on('translationFailed', (event) => failures.push(event));
  return { service, failures };
};

describe('MessageTranslationService — translationFailed requires a conversation (#18097)', () => {
  beforeEach(() => jest.clearAllMocks());

  it('does not announce a failure without a conversationId, but still counts it', async () => {
    const { service, failures } = await startedService();
    const errorsBefore = service.getStats().errors;

    fakeZmqClient.emit('translationError', translationError({ conversationId: '' }));
    await flushAsync();

    expect(failures).toHaveLength(0);
    expect(service.getStats().errors).toBe(errorsBefore + 1);
  });

  it('counts a pool-full rejection without a conversationId and announces nothing', async () => {
    const { service, failures } = await startedService();
    const poolBefore = service.getStats().pool_full_rejections;
    const errorsBefore = service.getStats().errors;

    fakeZmqClient.emit('translationError', translationError({ conversationId: '', error: 'translation pool full' }));
    await flushAsync();

    expect(failures).toHaveLength(0);
    expect(service.getStats().pool_full_rejections).toBe(poolBefore + 1);
    expect(service.getStats().errors).toBe(errorsBefore + 1);
  });

  it('announces a failure with a conversationId exactly as before', async () => {
    const { failures } = await startedService();

    fakeZmqClient.emit('translationError', translationError());
    await flushAsync();

    expect(failures).toEqual([
      { messageId: MESSAGE_ID, conversationId: CONVERSATION_ID, error: 'translation failed', taskId: 'task-1' }
    ]);
  });

  it('announces a failure whose taskId is absent', async () => {
    const { failures } = await startedService();

    fakeZmqClient.emit('translationError', translationError({ taskId: undefined }));
    await flushAsync();

    expect(failures).toStrictEqual([
      { messageId: MESSAGE_ID, conversationId: CONVERSATION_ID, error: 'translation failed', taskId: undefined }
    ]);
  });
});
