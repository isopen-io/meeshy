import { describe, it, expect, beforeAll, beforeEach } from '@jest/globals';

const stdoutWrites: string[] = [];

beforeAll(() => {
  jest.spyOn(process.stdout, 'write').mockImplementation((chunk: any) => {
    stdoutWrites.push(typeof chunk === 'string' ? chunk : chunk.toString());
    return true;
  });
});

beforeEach(() => {
  stdoutWrites.length = 0;
});

import { performanceLogger } from '../../utils/logger-enhanced';

describe('performanceLogger.withTiming', () => {
  it('emits a start log, awaits the inner fn, emits an end log with durationMs and returns the inner value', async () => {
    const result = await performanceLogger.withTiming(
      'test.step',
      async () => {
        await new Promise((r) => setTimeout(r, 10));
        return 'inner-value';
      },
      { clientMessageId: 'cid_test' }
    );

    expect(result).toBe('inner-value');

    const startLog = stdoutWrites.find(
      (l) => l.includes('"step":"test.step"') && l.includes('"phase":"start"')
    );
    const endLog = stdoutWrites.find(
      (l) => l.includes('"step":"test.step"') && l.includes('"phase":"end"')
    );

    expect(startLog).toBeDefined();
    expect(endLog).toBeDefined();
    expect(endLog).toMatch(/"durationMs":\s*\d+/);
    expect(endLog).toContain('"clientMessageId":"cid_test"');
  });

  it('emits an end log with error=true when the inner fn throws, and rethrows', async () => {
    await expect(
      performanceLogger.withTiming('test.step.fail', async () => {
        throw new Error('boom');
      })
    ).rejects.toThrow('boom');

    const endLog = stdoutWrites.find(
      (l) => l.includes('"step":"test.step.fail"') && l.includes('"phase":"end"')
    );

    expect(endLog).toBeDefined();
    expect(endLog).toContain('"error":true');
  });
});
