/**
 * CallNotification — group calls must not read like a 1:1 call (audit
 * calls-audit 2026-08-14, W6 follow-up from tasks/2026-08-13-group-calls-
 * gap-analysis.md: "CallNotification mono-appelant").
 *
 * `CallInitiatedEvent.participants` already carries every participant the
 * gateway rang (initiator + every invited member, `CallEventsHandler.ts`
 * `call:initiate`/`call:check-active` handlers) — a direct call always has
 * exactly the initiator + the callee (<=2 entries once populated), a group
 * call has 3+. The banner only ever rendered the initiator's name and a
 * generic "Incoming call..." subtitle, identical whether Alice was calling
 * you alone or ringing you as part of a 5-person group — a callee had no way
 * to tell the two apart before accepting.
 */

import { render, screen } from '@testing-library/react';
import type { CallInitiatedEvent, CallParticipant } from '@meeshy/shared/types/video-call';

const T_MAP: Record<string, string> = {
  'incoming.videoCall': 'Video Call',
  'incoming.audioCall': 'Audio Call',
  'incoming.subtitle': 'Incoming call...',
  'incoming.groupSubtitle': 'Group call',
  'incoming.groupCallLabel': '{count} people',
};

jest.mock('@/hooks/useI18n', () => ({
  useI18n: () => ({ t: (key: string) => T_MAP[key] ?? key }),
}));

jest.mock('@/utils/ringtone', () => ({
  getRingtone: () => ({ play: jest.fn(), stop: jest.fn() }),
}));

import { CallNotification } from '@/components/video-call/CallNotification';

const participant = (userId: string, username: string): CallParticipant => ({
  id: `part-${userId}`,
  callSessionId: 'call-1',
  userId,
  role: 'participant' as CallParticipant['role'],
  joinedAt: new Date(),
  isAudioEnabled: true,
  isVideoEnabled: true,
  username,
});

const baseCall: CallInitiatedEvent = {
  callId: 'call-1',
  conversationId: 'conv-1',
  mode: 'p2p',
  type: 'video',
  initiator: { userId: 'u1', username: 'alice' },
  participants: [],
};

describe('CallNotification — group call context', () => {
  it('shows the plain 1:1 subtitle for a direct call (initiator + callee, 2 entries)', () => {
    render(
      <CallNotification
        call={{ ...baseCall, participants: [participant('u1', 'alice'), participant('u2', 'bob')] }}
        onAccept={jest.fn()}
        onReject={jest.fn()}
      />
    );
    expect(screen.getByText('Incoming call...')).toBeInTheDocument();
    expect(screen.queryByText('Group call')).not.toBeInTheDocument();
    expect(screen.queryByText('3 people')).not.toBeInTheDocument();
  });

  it('still shows the plain 1:1 subtitle when participants is empty (legacy/replay payload)', () => {
    render(<CallNotification call={baseCall} onAccept={jest.fn()} onReject={jest.fn()} />);
    expect(screen.getByText('Incoming call...')).toBeInTheDocument();
    expect(screen.queryByText('Group call')).not.toBeInTheDocument();
  });

  it('shows the group subtitle and participant count for a group call (3+ entries)', () => {
    render(
      <CallNotification
        call={{
          ...baseCall,
          participants: [
            participant('u1', 'alice'),
            participant('u2', 'bob'),
            participant('u3', 'carol'),
          ],
        }}
        onAccept={jest.fn()}
        onReject={jest.fn()}
      />
    );
    expect(screen.getByText('Group call')).toBeInTheDocument();
    expect(screen.getByText('3 people')).toBeInTheDocument();
    expect(screen.queryByText('Incoming call...')).not.toBeInTheDocument();
  });

  it('recomputes the count for a larger group (5 entries)', () => {
    render(
      <CallNotification
        call={{
          ...baseCall,
          participants: [
            participant('u1', 'alice'),
            participant('u2', 'bob'),
            participant('u3', 'carol'),
            participant('u4', 'dave'),
            participant('u5', 'erin'),
          ],
        }}
        onAccept={jest.fn()}
        onReject={jest.fn()}
      />
    );
    expect(screen.getByText('5 people')).toBeInTheDocument();
  });

  it('still shows the caller name and accept/decline controls on a group call', () => {
    render(
      <CallNotification
        call={{
          ...baseCall,
          participants: [
            participant('u1', 'alice'),
            participant('u2', 'bob'),
            participant('u3', 'carol'),
          ],
        }}
        onAccept={jest.fn()}
        onReject={jest.fn()}
      />
    );
    expect(screen.getByText('alice')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /accept/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /decline/i })).toBeInTheDocument();
  });
});
