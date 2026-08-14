/**
 * CallWaitingBanner — presentational render + action wiring.
 */

import { render, screen, fireEvent } from '@testing-library/react';

jest.mock('@/hooks/useI18n', () => ({
  useI18n: () => ({ t: (key: string) => key }),
}));

import { CallWaitingBanner } from '@/components/video-call/CallWaitingBanner';

function makeCall(overrides: Record<string, unknown> = {}) {
  return {
    callId: 'w-1',
    conversationId: 'c-1',
    mode: 'p2p',
    type: 'audio',
    initiator: { userId: 'u-9', username: 'Alice' },
    participants: [],
    ...overrides,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

describe('CallWaitingBanner', () => {
  it('renders the caller name and both actions', () => {
    render(<CallWaitingBanner call={makeCall()} onReject={jest.fn()} onEndAndAnswer={jest.fn()} />);
    expect(screen.getByTestId('call-waiting-banner')).toBeInTheDocument();
    expect(screen.getByText('Alice')).toBeInTheDocument();
    expect(screen.getByText('callWaiting.reject')).toBeInTheDocument();
    expect(screen.getByText('callWaiting.endAndAnswer')).toBeInTheDocument();
  });

  it('fires onReject when Decline is tapped', () => {
    const onReject = jest.fn();
    render(<CallWaitingBanner call={makeCall()} onReject={onReject} onEndAndAnswer={jest.fn()} />);
    fireEvent.click(screen.getByText('callWaiting.reject'));
    expect(onReject).toHaveBeenCalledTimes(1);
  });

  it('fires onEndAndAnswer when End & answer is tapped', () => {
    const onEndAndAnswer = jest.fn();
    render(<CallWaitingBanner call={makeCall()} onReject={jest.fn()} onEndAndAnswer={onEndAndAnswer} />);
    fireEvent.click(screen.getByText('callWaiting.endAndAnswer'));
    expect(onEndAndAnswer).toHaveBeenCalledTimes(1);
  });

  // Group-calls gap analysis (tasks/2026-08-13-group-calls-gap-analysis.md,
  // W6) — same fix as CallNotification: a second incoming group call must
  // read as a group call, not as a 1:1 from the initiator.
  it('shows the group context line with the conversation title for a titled group call', () => {
    render(
      <CallWaitingBanner
        call={makeCall({ conversationType: 'group', conversationTitle: 'Design Team' })}
        onReject={jest.fn()}
        onEndAndAnswer={jest.fn()}
      />
    );
    expect(screen.getByTestId('call-waiting-group-context')).toHaveTextContent('Design Team');
  });

  it('never shows the group context line for a direct call', () => {
    render(
      <CallWaitingBanner
        call={makeCall({ conversationType: 'direct', conversationTitle: null })}
        onReject={jest.fn()}
        onEndAndAnswer={jest.fn()}
      />
    );
    expect(screen.queryByTestId('call-waiting-group-context')).not.toBeInTheDocument();
  });
});
