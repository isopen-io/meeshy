/**
 * CallNotification — audio-only incoming calls must not be mislabeled as
 * video calls (Vague 32).
 *
 * `call.type` is 'audio' | 'video' (CallInitiatedEvent, already correctly
 * consumed by CallManager's media-constraint gate) but the banner hardcoded
 * a Video icon + the 'calls.incoming.videoCall' string regardless of type —
 * a callee receiving a pure audio call saw a pulsing video icon and "Video
 * Call", misleading them about what they're about to join.
 */

import { render, screen } from '@testing-library/react';
import type { CallInitiatedEvent } from '@meeshy/shared/types/video-call';

jest.mock('@/hooks/useI18n', () => ({
  useI18n: () => ({ t: (key: string) => key }),
}));

jest.mock('@/utils/ringtone', () => ({
  getRingtone: () => ({ play: jest.fn(), stop: jest.fn() }),
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

describe('CallNotification — media type label', () => {
  it('shows the video label/icon for a video call', () => {
    render(<CallNotification call={baseCall} onAccept={jest.fn()} onReject={jest.fn()} />);
    expect(screen.getByText('calls.incoming.videoCall')).toBeInTheDocument();
    expect(screen.queryByText('calls.incoming.audioCall')).not.toBeInTheDocument();
  });

  it('shows the audio label, not the video label, for an audio-only call', () => {
    render(
      <CallNotification
        call={{ ...baseCall, type: 'audio' }}
        onAccept={jest.fn()}
        onReject={jest.fn()}
      />
    );
    expect(screen.getByText('calls.incoming.audioCall')).toBeInTheDocument();
    expect(screen.queryByText('calls.incoming.videoCall')).not.toBeInTheDocument();
  });
});
