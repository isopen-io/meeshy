/**
 * CallService.rescheduleRingingTimeout — boot rehydration (CALL-RESILIENCE item H)
 *
 * A gateway restart wipes the in-process ringing timers. At boot,
 * CallEventsHandler.rehydrateActiveCalls re-arms each surviving pre-answer
 * call via this method, which owns the remaining-budget computation:
 * fire at `startedAt + RINGING_TIMEOUT_MS` (as if the timer had never been
 * lost), clamped to a short floor when the budget is already exhausted so
 * just-rebooted clients still get a beat to answer/cancel first.
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { CallService } from '../../../services/CallService';
import type { PrismaClient } from '@meeshy/shared/prisma/client';

describe('CallService — rescheduleRingingTimeout (boot rehydration)', () => {
  let service: CallService;

  beforeEach(() => {
    jest.useFakeTimers();
    service = new CallService({} as PrismaClient);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('fires after the REMAINING ringing budget for a call already ringing before the restart', () => {
    const callback = jest.fn();
    const startedAt = new Date(Date.now() - 10_000); // rang 10s before the restart
    service.rescheduleRingingTimeout('call-rh-1', startedAt, callback);
    jest.advanceTimersByTime(49_000); // 49s < 50s remaining
    expect(callback).not.toHaveBeenCalled();
    jest.advanceTimersByTime(2_000);  // 51s ≥ 50s remaining
    expect(callback).toHaveBeenCalledTimes(1);
  });

  it('clamps to a short floor when the ringing budget is already exhausted', () => {
    const callback = jest.fn();
    const startedAt = new Date(Date.now() - 300_000); // long overdue
    service.rescheduleRingingTimeout('call-rh-2', startedAt, callback);
    jest.advanceTimersByTime(4_000);
    expect(callback).not.toHaveBeenCalled();
    jest.advanceTimersByTime(1_500);  // 5.5s ≥ 5s floor
    expect(callback).toHaveBeenCalledTimes(1);
  });

  it('keeps the nominal 60s budget for a call that started exactly at restart time', () => {
    const callback = jest.fn();
    const startedAt = new Date();
    service.rescheduleRingingTimeout('call-rh-3', startedAt, callback);
    jest.advanceTimersByTime(59_000);
    expect(callback).not.toHaveBeenCalled();
    jest.advanceTimersByTime(2_000);
    expect(callback).toHaveBeenCalledTimes(1);
  });

  it('is cancelable via clearRingingTimeout like a normal ringing timer', () => {
    const callback = jest.fn();
    service.rescheduleRingingTimeout('call-rh-4', new Date(), callback);
    service.clearRingingTimeout('call-rh-4');
    jest.advanceTimersByTime(61_000);
    expect(callback).not.toHaveBeenCalled();
  });

  it('replaces a previously armed timer for the same callId', () => {
    const cb1 = jest.fn();
    const cb2 = jest.fn();
    service.rescheduleRingingTimeout('call-rh-5', new Date(), cb1);
    service.rescheduleRingingTimeout('call-rh-5', new Date(), cb2);
    jest.advanceTimersByTime(61_000);
    expect(cb1).not.toHaveBeenCalled();
    expect(cb2).toHaveBeenCalledTimes(1);
  });
});
