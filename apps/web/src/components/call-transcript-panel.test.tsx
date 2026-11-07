import { describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

import type { TranscriptLine } from '@/lib/calls/call-transcript';
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
  offsetSec: 4,
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
