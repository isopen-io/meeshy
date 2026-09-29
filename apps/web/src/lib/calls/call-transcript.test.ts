import { describe, expect, test } from 'bun:test';

import type { HttpRequest } from '@/lib/api/http';

import { decodeCallTranscript, loadCallTranscript, transcriptLines, type CallTranscript } from './call-transcript';

/**
 * LA TRANSCRIPTION D'APRÈS L'APPEL (#8048, G6) — la forme servie par
 * `GET /calls/:callId/transcript`, et ce que le lecteur en LIT : le Prisme
 * descendu rang par rang, jamais la première traduction venue.
 */

const wire = {
  callId: 'call-1',
  conversationId: 'c-1',
  callStartedAt: '2026-09-26T09:00:00.000Z',
  total: 3,
  hasMore: false,
  segments: [
    { id: 't-3', speakerId: 'u-peer', speakerDisplayName: 'Kwame', text: 'Great, let’s go.', language: 'en', confidence: 0.9, capturedAtMs: Date.parse('2026-09-26T09:01:15.000Z'), translations: [{ targetLanguage: 'es', translatedText: 'Genial, vamos.' }] },
    { id: 't-1', speakerId: 'u-peer', speakerDisplayName: 'Kwame', text: 'Hi, can you hear me?', language: 'en', confidence: null, capturedAtMs: Date.parse('2026-09-26T09:00:04.000Z'), translations: [{ targetLanguage: 'es', translatedText: 'Hola' }, { targetLanguage: 'fr', translatedText: 'Salut, tu m’entends ?' }] },
    { id: 't-2', speakerId: 'u-me', speakerDisplayName: null, text: 'Oui, très bien.', language: 'fr', confidence: 0.8, capturedAtMs: Date.parse('2026-09-26T09:00:09.000Z'), translations: [{ targetLanguage: 'en', translatedText: 'Yes, very well.' }] },
    { id: 'vide', speakerId: 'u-peer', text: '  ', language: 'en', capturedAtMs: 0 },
    { pasUnSegment: true },
  ],
};

const reader = { viewerId: 'u-me', languages: ['fr', 'en'] } as const;

describe('la transcription d’après l’appel (#8048)', () => {
  test('les lignes suivent l’heure de capture, datées depuis le début de l’appel', () => {
    const transcript = decodeCallTranscript(wire) as CallTranscript;
    expect(transcriptLines(transcript, reader).map((line) => [line.id, line.offsetSec])).toEqual([
      ['t-1', 4],
      ['t-2', 9],
      ['t-3', 75],
    ]);
  });

  test('la parole d’un autre descend le Prisme du lecteur ; la mienne reste la mienne', () => {
    const lines = transcriptLines(decodeCallTranscript(wire) as CallTranscript, reader);
    expect(lines[0]).toMatchObject({ text: 'Salut, tu m’entends ?', language: 'fr', translated: true, original: 'Hi, can you hear me?', speakerName: 'Kwame', mine: false });
    expect(lines[1]).toMatchObject({ text: 'Oui, très bien.', translated: false, mine: true });
  });

  test('sans traduction vers une langue du lecteur, l’ORIGINAL — jamais la première traduction venue ; au rang 2, l’original déjà dans la langue', () => {
    const lines = transcriptLines(decodeCallTranscript(wire) as CallTranscript, reader);
    expect(lines[2]).toMatchObject({ text: 'Great, let’s go.', translated: false, language: 'en' });
    const spanish = transcriptLines(decodeCallTranscript(wire) as CallTranscript, { viewerId: 'u-me', languages: ['de', 'es'] });
    expect(spanish[2]).toMatchObject({ text: 'Genial, vamos.', language: 'es', translated: true });
  });

  test('un corps illisible n’est pas une transcription', () => {
    expect(decodeCallTranscript({ segments: 'non' })).toBeNull();
    expect(decodeCallTranscript({ callId: 'c', segments: [] })).toEqual({ callId: 'c', startedAtMs: null, segments: [] });
  });

  test('la passerelle est lue au bon chemin ; un refus (403) ou un appel inconnu (404) se lisent « rien », une panne reste une panne', async () => {
    const asked: HttpRequest[] = [];
    const transport = (status: number, data: unknown) => ({
      request: async (request: HttpRequest) => {
        asked.push(request);
        return status === 200 ? { ok: true as const, data } : { ok: false as const, status, error: 'x' };
      },
    });
    const ok = await loadCallTranscript({ source: 'gateway', transport: transport(200, wire) as never }, 'call 1');
    expect(asked[0]).toMatchObject({ method: 'GET', path: '/api/v1/calls/call%201/transcript?limit=100' });
    expect(ok.ok && ok.data?.segments).toHaveLength(3);
    expect(await loadCallTranscript({ source: 'gateway', transport: transport(403, null) as never }, 'c')).toEqual({ ok: true, data: null });
    expect((await loadCallTranscript({ source: 'gateway', transport: transport(500, null) as never }, 'c')).ok).toBe(false);
  });

  const segment = (n: number) => ({ id: `s-${n}`, speakerId: 'u-peer', text: `Line ${n}`, language: 'en', capturedAtMs: n, translations: [] });

  const paged = (pages: readonly (readonly [number, unknown])[]) => {
    const asked: HttpRequest[] = [];
    const transport = {
      request: async (request: HttpRequest) => {
        const [status, data] = pages[asked.length] ?? [500, null];
        asked.push(request);
        return status === 200 ? { ok: true as const, data } : { ok: false as const, status, error: 'x' };
      },
    };
    return { asked, transport };
  };

  const page = (from: number, count: number, hasMore: boolean) => ({ callId: 'call-1', callStartedAt: '2026-09-26T09:00:00.000Z', total: 250, hasMore, segments: Array.from({ length: count }, (_, n) => segment(from + n)) });

  test('TOUT l’appel, page après page : la passerelle sert cent segments à la fois, le journal d’après l’appel les lit tous (#8579)', async () => {
    const { asked, transport } = paged([
      [200, page(0, 100, true)],
      [200, page(100, 100, true)],
      [200, page(200, 50, false)],
    ]);
    const result = await loadCallTranscript({ source: 'gateway', transport: transport as never }, 'call-1');
    expect(asked.map((request) => request.path)).toEqual(['/api/v1/calls/call-1/transcript?limit=100', '/api/v1/calls/call-1/transcript?limit=100&offset=100', '/api/v1/calls/call-1/transcript?limit=100&offset=200']);
    expect(result.ok && result.data?.segments.map((entry) => entry.id)).toEqual(Array.from({ length: 250 }, (_, n) => `s-${n}`));
  });

  test('une page suivante refusée (trop de demandes) garde ce qui est déjà lu', async () => {
    const { transport } = paged([
      [200, page(0, 100, true)],
      [429, null],
    ]);
    const result = await loadCallTranscript({ source: 'gateway', transport: transport as never }, 'call-1');
    expect(result.ok && result.data?.segments).toHaveLength(100);
  });
});
