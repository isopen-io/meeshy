/**
 * CallNotification — an incoming call dismissed before the async
 * `import('@/utils/ringtone')` resolves must never start ringing (Vague 103).
 *
 * `ringtoneRef.current` is only assigned inside the `.then()` of the dynamic
 * import. If the component unmounts before that import resolves, the
 * effect's cleanup runs against a still-`null` ref — nothing is stopped —
 * and the `.then()` callback later fires unconditionally, starting the
 * shared ringtone singleton for a call that is already gone, with nothing
 * left in the tree able to ever call `.stop()` on it.
 */

import { render } from '@testing-library/react';
import type { CallInitiatedEvent } from '@meeshy/shared/types/video-call';

jest.mock('@/hooks/useI18n', () => ({
  useI18n: () => ({ t: (key: string) => key }),
}));

const play = jest.fn();
const stop = jest.fn();

jest.mock('@/utils/ringtone', () => ({
  getRingtone: () => ({ play, stop }),
}));

import { CallNotification } from '@/components/video-call/CallNotification';

const baseCall: CallInitiatedEvent = {
  callId: 'call-1',
  conversationId: 'conv-1',
  mode: 'p2p',
  type: 'video',
  initiator: { userId: 'u1', username: 'alice' },
  participants: [],
};

describe('CallNotification — ringtone unmount race', () => {
  beforeEach(() => {
    play.mockClear();
    stop.mockClear();
  });

  it('never plays the ringtone when unmounted before the dynamic import resolves', async () => {
    const { unmount } = render(
      <CallNotification call={baseCall} onAccept={jest.fn()} onReject={jest.fn()} />
    );

    // Unmount synchronously — before the pending `import()` microtask settles.
    unmount();

    // Let the dynamic import's `.then()` callback run, if it's going to.
    await Promise.resolve();
    await Promise.resolve();

    expect(play).not.toHaveBeenCalled();
    expect(stop).not.toHaveBeenCalled();
  });

  it('still plays on mount and stops on a normal unmount (no regression)', async () => {
    const { unmount } = render(
      <CallNotification call={baseCall} onAccept={jest.fn()} onReject={jest.fn()} />
    );

    await Promise.resolve();
    await Promise.resolve();

    expect(play).toHaveBeenCalledTimes(1);

    unmount();

    expect(stop).toHaveBeenCalledTimes(1);
  });
});
