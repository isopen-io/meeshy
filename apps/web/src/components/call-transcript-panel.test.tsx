import { describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

import type { TranscriptLine, TranscriptNote } from '@/lib/calls/call-transcript';
import { authorInk } from '@/lib/view/author-ink';

import { CallTranscriptLines } from './call-transcript-panel';

/**
 * LE JOURNAL D'APRÈS L'APPEL, FIDÈLE (#16634, `docs/product/appels-vue-finale.md`
 * loi 7) — chaque ligne garde la couleur de son auteur, sur le nom ET sur la
 * phrase servie, rendue lisible sur le fond du fil (`authorInk`) ; l'original,
 * quand on le demande, reste à l'encre secondaire.
 */

const line = (overrides: Partial<TranscriptLine> = {}): TranscriptLine => ({
  id: 's-1',
  speakerId: 'u-awa',
  speakerName: 'Awa',
  mine: false,
  offsetMs: 4_000,
  original: 'Can you hear me?',
  text: 'Tu m’entends ?',
  language: 'fr',
  translated: true,
  ...overrides,
});

const render = (lines: readonly TranscriptLine[], original = false) => renderToStaticMarkup(<CallTranscriptLines lines={lines} language="fr" original={original} />);

const inkOf = (html: string, marker: string): readonly string[] => {
  const entry = html.split('<li').find((chunk) => chunk.includes(marker)) ?? '';
  return [...entry.matchAll(/--author-ink-dark:(#[0-9a-f]{6})/g)].map((match) => match[1] ?? '');
};

describe('le journal d’après l’appel (#16634)', () => {
  test('le nom ET la phrase TRADUITE d’un pair portent son encre d’auteur', () => {
    const html = render([line()]);
    const ink = authorInk({ authorId: 'u-awa', name: 'Awa' });
    expect(inkOf(html, 'data-call-transcript-line="peer"')).toEqual([ink.dark, ink.dark]);
    expect(html).toContain(`--author-ink-light:${ink.light}`);
    expect(html).toMatch(/class="[^"]*author-ink[^"]*"[^>]*>Awa</);
    expect(html).toMatch(/class="[^"]*author-ink[^"]*"[^>]*>Tu m’entends \?</);
  });

  test('mon nom porte MA couleur ; ma parole, jamais traduite, reste à l’encre du thème', () => {
    const html = render([line({ id: 's-2', speakerId: 'u-moi', speakerName: 'Moi', mine: true, text: 'Oui', original: 'Oui', translated: false })]);
    expect(inkOf(html, 'data-call-transcript-line="mine"')).toEqual([authorInk({ authorId: 'u-moi', name: 'Moi' }).dark]);
    expect(html).toMatch(/data-call-transcript-text="original"[^>]*>Oui</);
  });

  test('deux auteurs, deux couleurs', () => {
    const html = render([line(), line({ id: 's-3', speakerId: 'u-karim', speakerName: 'Karim' })]);
    const [awa, karim] = html.split('<li').slice(1).map((chunk) => /--author-ink-dark:(#[0-9a-f]{6})/.exec(chunk)?.[1]);
    expect(awa).toBe(authorInk({ authorId: 'u-awa', name: 'Awa' }).dark);
    expect(karim).toBe(authorInk({ authorId: 'u-karim', name: 'Karim' }).dark);
  });

  test('« Voir l’original » rend ce qui a été dit, à l’encre du thème : seule une traduction prend la couleur', () => {
    const html = render([line()], true);
    expect(html).toMatch(/data-call-transcript-text="original"[^>]*>Can you hear me\?</);
    expect(inkOf(html, 'data-call-transcript-line="peer"')).toHaveLength(1);
  });
});

describe('les captures dans le journal d’après l’appel (#16665)', () => {
  const notes: readonly TranscriptNote[] = [
    { id: 'cap-1', kind: 'screenshot', userId: 'u-karim', name: 'Karim', offsetMs: 6_000 },
    { id: 'cap-2', kind: 'call-recording-started', userId: 'u-awa', name: 'Awa', offsetMs: 1_000 },
  ];
  const html = renderToStaticMarkup(<CallTranscriptLines lines={[line({ offsetMs: 4_000 }), line({ id: 's-9', offsetMs: 9_000 })]} notes={notes} language="fr" original={false} />);

  test('chaque capture entre à son heure dans l’appel, parmi les phrases', () => {
    const order = [...html.matchAll(/data-call-transcript-(?:line|note)="([^"]+)"/g)].map((match) => match[1]);
    expect(order).toEqual(['call-recording-started', 'peer', 'screenshot', 'peer']);
  });

  test('« Karim a capturé l’écran » : la phrase à l’encre secondaire, le pseudo seul à son encre d’auteur, l’heure au bout', () => {
    const entry = html.split('<li').find((chunk) => chunk.includes('data-call-transcript-note="screenshot"')) ?? '';
    expect(entry).toContain('00:06');
    expect(entry).toContain('style="color:var(--color-ios-ink-2)" dir="ltr" data-call-transcript-note-text=""');
    expect(entry).toMatch(/<strong class="author-ink" style="[^"]*" data-call-journal-note-name=""><bdi>Karim<\/bdi><\/strong> a capturé l’écran/);
    expect(entry).toContain(`--author-ink-dark:${authorInk({ authorId: 'u-karim', name: 'Karim' }).dark}`);
  });

  test('l’enregistrement consenti : « L’enregistrement de l’appel a commencé »', () => {
    expect(html).toContain('L’enregistrement de l’appel a commencé');
  });
});
