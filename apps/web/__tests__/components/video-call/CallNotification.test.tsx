/**
 * CallNotification — audio-only incoming calls must not be mislabeled as
 * video calls (Vague 32).
 *
 * `call.type` is 'audio' | 'video' (CallInitiatedEvent, already correctly
 * consumed by CallManager's media-constraint gate) but the banner hardcoded
 * a Video icon + the 'incoming.videoCall' string regardless of type —
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
    expect(screen.getByText('incoming.videoCall')).toBeInTheDocument();
    expect(screen.queryByText('incoming.audioCall')).not.toBeInTheDocument();
  });

  it('shows the audio label, not the video label, for an audio-only call', () => {
    render(
      <CallNotification
        call={{ ...baseCall, type: 'audio' }}
        onAccept={jest.fn()}
        onReject={jest.fn()}
      />
    );
    expect(screen.getByText('incoming.audioCall')).toBeInTheDocument();
    expect(screen.queryByText('incoming.videoCall')).not.toBeInTheDocument();
  });
});

/**
 * Group-calls gap analysis (tasks/2026-08-13-group-calls-gap-analysis.md, W6)
 * — the ringing banner showed only the initiator's name, indistinguishable
 * from a direct call, even when the initiator actually rang a whole group.
 */
describe('CallNotification — group call context', () => {
  it('shows the group context line with the conversation title for a titled group call', () => {
    render(
      <CallNotification
        call={{ ...baseCall, conversationType: 'group', conversationTitle: 'Design Team' }}
        onAccept={jest.fn()}
        onReject={jest.fn()}
      />
    );
    const groupContext = screen.getByTestId('call-notification-group-context');
    expect(groupContext).toHaveTextContent('Design Team');
  });

  it('shows the group context line without a title for an untitled group call', () => {
    render(
      <CallNotification
        call={{ ...baseCall, conversationType: 'group', conversationTitle: null }}
        onAccept={jest.fn()}
        onReject={jest.fn()}
      />
    );
    expect(screen.getByTestId('call-notification-group-context')).toBeInTheDocument();
  });

  it('never shows the group context line for a direct call', () => {
    render(
      <CallNotification
        call={{ ...baseCall, conversationType: 'direct', conversationTitle: null }}
        onAccept={jest.fn()}
        onReject={jest.fn()}
      />
    );
    expect(screen.queryByTestId('call-notification-group-context')).not.toBeInTheDocument();
  });

  it('never shows the group context line when conversationType is absent (older gateway)', () => {
    render(<CallNotification call={baseCall} onAccept={jest.fn()} onReject={jest.fn()} />);
    expect(screen.queryByTestId('call-notification-group-context')).not.toBeInTheDocument();
  });
});
