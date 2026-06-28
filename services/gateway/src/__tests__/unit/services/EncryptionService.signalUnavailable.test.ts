/**
 * EncryptionService — Signal Protocol unavailable paths
 *
 * This file intentionally overrides the global @signalapp/libsignal-client mock
 * with a factory that throws, simulating a platform where the native module is
 * unavailable. This covers:
 *  - Line 44: module-level catch (logger.warn when signal fails to load)
 *  - Line 783: generatePreKeyBundle throws 'Signal Protocol is not available'
 *
 * The file-level jest.mock is hoisted before imports and overrides the global
 * mock registered in jest.setup.js.
 *
 * @jest-environment node
 */

jest.mock('@signalapp/libsignal-client', () => {
  throw new Error('libsignal-client: native module not available');
});

import { describe, it, expect, jest, afterEach } from '@jest/globals';
import { EncryptionService, shutdownEncryptionService } from '../../../services/EncryptionService';

const buildPrisma = () => {
  const store = new Map<string, any>();
  return {
    conversation: { findUnique: jest.fn<any>(), update: jest.fn<any>() },
    user: { findUnique: jest.fn<any>(), update: jest.fn<any>() },
    signalPreKeyBundle: { findUnique: jest.fn<any>(), upsert: jest.fn<any>() },
    serverEncryptionKey: {
      create: jest.fn<any>(async (a: any) => { store.set(a.data.id, a.data); return a.data; }),
      findUnique: jest.fn<any>(async (a: any) => store.get(a.where.id) ?? null),
      findMany: jest.fn<any>(async () => []),
      update: jest.fn<any>(async () => null),
    },
  } as any;
};

afterEach(async () => {
  await shutdownEncryptionService().catch(() => {});
});

describe('EncryptionService — Signal Protocol unavailable', () => {
  it('generatePreKeyBundle throws when signal library is not available (line 783)', async () => {
    process.env.ENCRYPTION_MASTER_KEY = Buffer.from('0123456789abcdef0123456789abcdef').toString('base64');

    const service = new EncryptionService(buildPrisma());
    await service.initialize();

    await expect(service.generatePreKeyBundle()).rejects.toThrow(
      'Signal Protocol is not available'
    );

    await service.shutdown().catch(() => {});
  });
});
