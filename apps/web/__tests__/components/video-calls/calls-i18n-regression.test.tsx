/**
 * Regression guard for a real production bug: every `useI18n('calls')`
 * consumer under video-calls/video-call used to pass keys PREFIXED with the
 * namespace itself — `t('calls.controls.mute')` — even though `useI18n`
 * already unwraps the `calls` root key from `locales/{locale}/calls.json`
 * before handing `translations` to `t()`. Looking up `translations['calls']`
 * on an object that no longer has a `calls` key always misses, so `t()` fell
 * through to its `fallback || key` branch and rendered the literal dotted
 * key string to real users, in every locale, for the entire calling UI
 * (mute/unmute, end call, switch camera, connection quality, …).
 *
 * Unlike the component's own test suite (which mocks `t` as the identity
 * function `(k) => k`, so it can't detect this class of bug — a wrong key
 * still round-trips to itself), this test uses the REAL `useI18n` hook
 * against the REAL `locales/*\/calls.json` files, so a reintroduced `calls.`
 * prefix — or a genuinely missing key — fails here.
 */
import { render, screen } from '@testing-library/react';
import { CallControls } from '@/components/video-calls/CallControls';
import enCalls from '@/locales/en/calls.json';
import frCalls from '@/locales/fr/calls.json';

let mockCurrentInterfaceLanguage = 'en';

jest.mock('@/stores', () => ({
  useLanguageStore: (selector: (state: any) => any) =>
    selector({
      currentInterfaceLanguage: mockCurrentInterfaceLanguage,
      setInterfaceLanguage: jest.fn(),
    }),
}));

const baseProps = {
  audioEnabled: true,
  videoEnabled: true,
  speakerEnabled: true,
  onToggleAudio: jest.fn(),
  onToggleVideo: jest.fn(),
  onToggleSpeaker: jest.fn(),
  onHangUp: jest.fn(),
};

describe('calls i18n — real translation catalog (regression)', () => {
  beforeEach(() => {
    mockCurrentInterfaceLanguage = 'en';
  });

  it('resolves CallControls aria-labels to the real English strings, not the raw key', async () => {
    render(<CallControls {...baseProps} />);

    expect(
      await screen.findByRole('button', { name: enCalls.calls.controls.mute })
    ).toBeInTheDocument();
    expect(
      await screen.findByRole('button', { name: enCalls.calls.controls.endCall })
    ).toBeInTheDocument();
    expect(screen.queryByText(/^calls\./)).not.toBeInTheDocument();
  });

  it('resolves CallControls aria-labels to the real French strings for the fr locale', async () => {
    mockCurrentInterfaceLanguage = 'fr';
    render(<CallControls {...baseProps} />);

    expect(
      await screen.findByRole('button', { name: frCalls.calls.controls.mute })
    ).toBeInTheDocument();
    expect(
      await screen.findByRole('button', { name: frCalls.calls.controls.endCall })
    ).toBeInTheDocument();
    expect(screen.queryByText(/^calls\./)).not.toBeInTheDocument();
  });
});
