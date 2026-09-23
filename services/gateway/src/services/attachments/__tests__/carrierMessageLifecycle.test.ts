/**
 * @jest-environment node
 */

import { describe, it, expect } from '@jest/globals';
import { carrierMessageStillServesBytes } from '../carrierMessageLifecycle';

const NOW = new Date('2026-08-12T12:00:00.000Z');
const EARLIER = new Date('2026-08-12T11:59:00.000Z');
const LATER = new Date('2026-08-12T12:01:00.000Z');

describe('carrierMessageStillServesBytes', () => {
  describe('when the carrier message is gone from the collection', () => {
    it('refuses — a hard-deleted message keeps nothing readable', () => {
      expect(carrierMessageStillServesBytes(null, NOW)).toBe(false);
    });

    it('refuses on undefined, which is what a missing select yields', () => {
      expect(carrierMessageStillServesBytes(undefined, NOW)).toBe(false);
    });
  });

  describe('when the carrier message is live', () => {
    it('serves a message that carries neither deletion nor deadline', () => {
      expect(carrierMessageStillServesBytes({}, NOW)).toBe(true);
    });

    it('serves a message whose deadline is still ahead', () => {
      expect(
        carrierMessageStillServesBytes({ deletedAt: null, expiresAt: LATER }, NOW)
      ).toBe(true);
    });
  });

  describe('when the carrier message was withdrawn', () => {
    it('refuses a soft-deleted message — recall, unsend and moderation share this column', () => {
      expect(carrierMessageStillServesBytes({ deletedAt: EARLIER }, NOW)).toBe(false);
    });

    it('refuses even when the deadline is still ahead — withdrawal is not negotiable', () => {
      expect(
        carrierMessageStillServesBytes({ deletedAt: EARLIER, expiresAt: LATER }, NOW)
      ).toBe(false);
    });
  });

  describe('when the deadline has passed', () => {
    it('refuses an expired ephemeral message', () => {
      expect(carrierMessageStillServesBytes({ expiresAt: EARLIER }, NOW)).toBe(false);
    });

    /**
     * #7578 — the view-once purge has its OWN column (`viewOnceBurnAt`), never
     * `expiresAt`: the bytes stop at that deadline too.
     */
    it('refuses a view-once message whose purge deadline has passed', () => {
      expect(carrierMessageStillServesBytes({ viewOnceBurnAt: EARLIER }, NOW)).toBe(false);
    });

    it('still serves a view-once message whose purge deadline is ahead', () => {
      expect(carrierMessageStillServesBytes({ viewOnceBurnAt: LATER }, NOW)).toBe(true);
    });

    /**
     * The sweep runs once a minute; between the deadline and the unlink the
     * bytes are still on disk. Serving them there is precisely the window this
     * predicate closes, so the boundary must refuse, not serve.
     */
    it('refuses at the exact deadline rather than serving one last time', () => {
      expect(carrierMessageStillServesBytes({ expiresAt: NOW }, NOW)).toBe(false);
    });
  });

  describe('when the deadline arrives as an ISO string rather than a Date', () => {
    it('refuses a past deadline serialized as a string', () => {
      expect(
        carrierMessageStillServesBytes({ expiresAt: EARLIER.toISOString() }, NOW)
      ).toBe(false);
    });

    it('serves a future deadline serialized as a string', () => {
      expect(
        carrierMessageStillServesBytes({ expiresAt: LATER.toISOString() }, NOW)
      ).toBe(true);
    });
  });

  /**
   * An unparseable deadline must not silently read as "already expired" — that
   * would make a serialization slip destroy live media. It reads as "no
   * deadline", which is the state the column had before anyone wrote to it.
   */
  it('serves when the deadline is unparseable rather than treating it as passed', () => {
    expect(carrierMessageStillServesBytes({ expiresAt: 'not-a-date' }, NOW)).toBe(true);
  });
});
