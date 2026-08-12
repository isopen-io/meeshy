/**
 * CallCaptionsOverlay — rendu des captions traduites en direct.
 * Présentationnel pur : reçoit les lignes du hook useCallCaptions et un
 * résolveur speakerId → nom. Rien ne s'affiche sans caption (pas de cadre
 * vide au-dessus des contrôles).
 */

import React from 'react';
import { render, screen } from '@testing-library/react';

jest.mock('@/hooks/useI18n', () => ({
  useI18n: () => ({ t: (key: string) => key }),
}));

import { CallCaptionsOverlay } from '@/components/video-calls/CallCaptionsOverlay';
import type { CallCaption } from '@/hooks/use-call-captions';

function caption(overrides: Partial<CallCaption> = {}): CallCaption {
  return {
    key: overrides.key ?? 'speaker-1:1',
    speakerId: overrides.speakerId ?? 'speaker-1',
    text: overrides.text ?? 'bonjour à tous',
    isFinal: overrides.isFinal ?? true,
  };
}

describe('CallCaptionsOverlay', () => {
  it('ne rend rien sans caption', () => {
    const { container } = render(<CallCaptionsOverlay captions={[]} />);

    expect(container.firstChild).toBeNull();
  });

  it('affiche le texte de chaque caption', () => {
    render(
      <CallCaptionsOverlay
        captions={[caption({ key: 'a', text: 'bonjour' }), caption({ key: 'b', text: 'comment ça va ?' })]}
      />
    );

    expect(screen.getByText('bonjour')).toBeInTheDocument();
    expect(screen.getByText('comment ça va ?')).toBeInTheDocument();
  });

  it('préfixe la ligne du nom du speaker quand le résolveur le connaît', () => {
    render(
      <CallCaptionsOverlay
        captions={[caption()]}
        resolveSpeakerName={(speakerId) => (speakerId === 'speaker-1' ? 'Alice' : undefined)}
      />
    );

    expect(screen.getByText('Alice')).toBeInTheDocument();
  });

  it('omet le préfixe quand le speaker est inconnu du résolveur', () => {
    render(
      <CallCaptionsOverlay
        captions={[caption({ speakerId: 'ghost' })]}
        resolveSpeakerName={() => undefined}
      />
    );

    expect(screen.getByTestId('call-captions').querySelectorAll('span')).toHaveLength(0);
  });

  it('marque visuellement les partials (opacité réduite) sans les masquer', () => {
    render(<CallCaptionsOverlay captions={[caption({ isFinal: false, text: 'bonjour à' })]} />);

    const line = screen.getByText('bonjour à');
    expect(line.className).toContain('opacity-70');
  });

  it('expose la région en aria-label i18n', () => {
    render(<CallCaptionsOverlay captions={[caption()]} />);

    expect(screen.getByRole('log')).toHaveAttribute('aria-label', 'calls.captions.region');
  });
});
