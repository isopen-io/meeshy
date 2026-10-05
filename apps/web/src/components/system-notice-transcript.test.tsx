import { describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

import type { CallNoticeTarget } from '@/lib/calls/call-notice';
import type { SystemRow } from '@/lib/view/message-badges';

import { SystemNotice } from './system-notice';

/**
 * LA TRANSCRIPTION DANS LA BULLE D'APPEL (#8048, G6) — un appel terminé qui a
 * duré porte, sous « Rappeler », un bouton qui DÉPLIE sa transcription ; replié
 * par défaut, sans rien charger (le panneau vit dans son propre chunk).
 */

const row: SystemRow = { kind: 'call', callType: 'video', text: 'Appel vidéo · 04:32' };

const target = (overrides: Partial<CallNoticeTarget> = {}): CallNoticeTarget => ({ conversationId: 'c-states', callId: 'call-1', media: 'video', live: false, transcript: true, recording: null, ...overrides });

const render = (callTarget: CallNoticeTarget) => renderToStaticMarkup(<SystemNotice row={row} timeString="09:06" surface="bubble" callTarget={callTarget} />);

describe('la bulle d’appel du fil (#8048)', () => {
  test('un appel terminé propose sa transcription, repliée, en cible de 44 px', () => {
    const html = render(target());
    expect(html).toContain('data-call-transcript-toggle');
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain('min-h-11');
    expect(html).not.toContain('data-call-transcript=');
  });

  test('un appel en cours ou sans transcription possible n’en propose aucune', () => {
    expect(render(target({ transcript: false }))).not.toContain('data-call-transcript-toggle');
    expect(render(target({ live: true, transcript: false }))).not.toContain('data-call-transcript-toggle');
  });
});
