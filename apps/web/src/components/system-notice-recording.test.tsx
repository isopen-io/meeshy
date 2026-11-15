import { describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

import type { Attachment } from '@/lib/api/types';
import type { CallNoticeTarget } from '@/lib/calls/call-notice';
import type { SystemRow } from '@/lib/view/message-badges';

import { SystemNotice } from './system-notice';

/**
 * L'ENREGISTREMENT D'UN APPEL SE RÉÉCOUTE DEPUIS SA BULLE (#8064) — le fichier
 * audio que l'enregistreur a rattaché à la bulle se joue par le lecteur de
 * vocal du fil, sous « Rappeler », sans rien d'autre à apprendre.
 */

const row: SystemRow = { kind: 'call', callType: 'audio', text: 'Appel audio · 04:32' };

const recording = { id: 'att-rec', mimeType: 'audio/webm', fileUrl: '/u/rec.webm', duration: 272_000 } as unknown as Attachment;

const target = (overrides: Partial<CallNoticeTarget> = {}): CallNoticeTarget => ({
  conversationId: 'c-rec',
  callId: 'call-1',
  media: 'audio',
  live: false,
  transcript: false,
  recording: { attachment: recording, language: 'fr' },
  ...overrides,
});

const render = (callTarget: CallNoticeTarget) =>
  renderToStaticMarkup(<SystemNotice row={row} timeString="09:06" surface="bubble" callTarget={callTarget} languages={['fr']} />);

describe('la bulle d’appel rejoue son enregistrement (#8064)', () => {
  test('un enregistrement rattaché se joue par le lecteur de vocal du fil', () => {
    const html = render(target());
    expect(html).toContain('data-call-recording="att-rec"');
    expect(html).toContain('data-call-notice-action="call-back"');
  });

  test('sans enregistrement, la bulle ne montre aucun lecteur', () => {
    expect(render(target({ recording: null }))).not.toContain('data-call-recording');
  });

  test('un enregistrement vidéo se revoit dans la bulle, par le lecteur vidéo du fil (#8437)', () => {
    const video = { id: 'att-vid', mimeType: 'video/webm', fileUrl: '/u/rec.webm', duration: 272_000, width: 1280, height: 720 } as unknown as Attachment;
    const html = render(target({ media: 'video', recording: { attachment: video, language: 'fr' } }));

    expect(html).toContain('data-call-recording="att-vid"');
    expect(html).toContain('data-video-status="idle"');
    expect(html).toMatch(/<video[^>]*src="[^"]*\/u\/rec\.webm"/);
    expect(html).toContain('data-video-control="play-pause"');
    expect(html).not.toContain('<audio');
  });
});
