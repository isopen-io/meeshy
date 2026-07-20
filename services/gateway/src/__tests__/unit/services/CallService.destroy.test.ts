/**
 * CallService.destroy — shutdown timer discipline
 *
 * Ringing timeouts (up to 60s) and heartbeat-DB debounce timers (30s) were
 * plain setTimeout handles with no teardown hook, unlike CallEventsHandler's
 * own disconnect-grace/buffer-cleanup timers which are cleared in
 * prepareForShutdown()/destroy(). destroy() must clear every in-flight timer
 * so nothing fires (and touches the DB) after the gateway starts shutting
 * down.
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { CallService } from '../../../services/CallService';
import type { PrismaClient } from '@meeshy/shared/prisma/client';

describe('CallService — destroy()', () => {
  let service: CallService;

  beforeEach(() => {
    jest.useFakeTimers();
    service = new CallService({} as PrismaClient);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('clears a scheduled ringing timeout so its onTimeout never fires', () => {
    const onTimeout = jest.fn();
    service.scheduleRingingTimeout('call-destroy-1', onTimeout);

    service.destroy();
    jest.advanceTimersByTime(120_000);

    expect(onTimeout).not.toHaveBeenCalled();
  });

  it('clears a pending heartbeat DB-write debounce timer so it never persists', () => {
    service.recordHeartbeat('call-destroy-2', 'participant-1');

    service.destroy();
    jest.advanceTimersByTime(60_000);

    // persistHeartbeatToDb would call prisma.callParticipant.updateMany if the
    // debounce timer had fired; the fake prisma below has no such method, so
    // reaching it would throw synchronously inside the (fake) timer callback.
    expect(() => jest.advanceTimersByTime(1)).not.toThrow();
  });

  it('leaves the service usable afterward (re-scheduling still works)', () => {
    const onTimeout = jest.fn();
    service.scheduleRingingTimeout('call-destroy-3', jest.fn());
    service.destroy();

    service.scheduleRingingTimeout('call-destroy-3', onTimeout);
    jest.advanceTimersByTime(60_000);

    expect(onTimeout).toHaveBeenCalledTimes(1);
  });
});
