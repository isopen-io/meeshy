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
    expect(screen.getByText('calls.callWaiting.reject')).toBeInTheDocument();
    expect(screen.getByText('calls.callWaiting.endAndAnswer')).toBeInTheDocument();
  });

  it('fires onReject when Decline is tapped', () => {
    const onReject = jest.fn();
    render(<CallWaitingBanner call={makeCall()} onReject={onReject} onEndAndAnswer={jest.fn()} />);
    fireEvent.click(screen.getByText('calls.callWaiting.reject'));
    expect(onReject).toHaveBeenCalledTimes(1);
  });

  it('fires onEndAndAnswer when End & answer is tapped', () => {
    const onEndAndAnswer = jest.fn();
    render(<CallWaitingBanner call={makeCall()} onReject={jest.fn()} onEndAndAnswer={onEndAndAnswer} />);
    fireEvent.click(screen.getByText('calls.callWaiting.endAndAnswer'));
    expect(onEndAndAnswer).toHaveBeenCalledTimes(1);
  });
});
