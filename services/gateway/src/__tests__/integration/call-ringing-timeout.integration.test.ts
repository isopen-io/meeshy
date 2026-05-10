import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { CallService } from '../../services/CallService';
import type { PrismaClient } from '@meeshy/shared/prisma/client';

describe('CallService — ringing timeout (Phase 1 fix P2)', () => {
  let prisma: PrismaClient;
  let service: CallService;

  beforeEach(() => {
    jest.useFakeTimers();
    prisma = {} as PrismaClient;  // not used by the timer methods themselves
    service = new CallService(prisma);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('exposes scheduleRingingTimeout method', () => {
    expect(typeof (service as any).scheduleRingingTimeout).toBe('function');
  });

  it('exposes clearRingingTimeout method', () => {
    expect(typeof (service as any).clearRingingTimeout).toBe('function');
  });

  it('schedules timeout firing at 60s after scheduleRingingTimeout', () => {
    const callback = jest.fn();
    (service as any).scheduleRingingTimeout('call-id-1', callback);
    expect(callback).not.toHaveBeenCalled();
    jest.advanceTimersByTime(59_000);
    expect(callback).not.toHaveBeenCalled();
    jest.advanceTimersByTime(2_000);   // total 61s
    expect(callback).toHaveBeenCalledTimes(1);
  });

  it('clearRingingTimeout cancels the scheduled timeout', () => {
    const callback = jest.fn();
    (service as any).scheduleRingingTimeout('call-id-2', callback);
    jest.advanceTimersByTime(30_000);
    (service as any).clearRingingTimeout('call-id-2');
    jest.advanceTimersByTime(60_000);   // would have fired without clear
    expect(callback).not.toHaveBeenCalled();
  });

  it('replaces previous timeout for same callId', () => {
    const cb1 = jest.fn();
    const cb2 = jest.fn();
    (service as any).scheduleRingingTimeout('call-id-3', cb1);
    (service as any).scheduleRingingTimeout('call-id-3', cb2);   // replaces
    jest.advanceTimersByTime(61_000);
    expect(cb1).not.toHaveBeenCalled();
    expect(cb2).toHaveBeenCalledTimes(1);
  });
});
