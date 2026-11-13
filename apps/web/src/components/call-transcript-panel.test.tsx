import { describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

import { loadCallControlsCatalog } from '@/lib/i18n-call-controls-catalog';
import { loadInterfaceCatalog, translate } from '@/lib/i18n-catalog';
import { SUPPORTED_INTERFACE_LANGUAGES } from '@/lib/inline-interface-language-bootstrap.js';

import type { TranscriptLine, TranscriptNote } from '@/lib/calls/call-transcript';
import { authorInk } from '@/lib/view/author-ink';

import { CallTranscriptLines } from './call-transcript-panel';

/**
 * LE JOURNAL D'APRÈS L'APPEL, FIDÈLE (#16634, `docs/product/appels-vue-finale.md`
 * loi 7) — chaque ligne garde la couleur de son auteur, sur le nom ET sur la
 * phrase servie, rendue lisible sur le fond du fil (`authorInk`) ; l'original,
 * quand on le demande, reste à l'encre secondaire.
 */

/* Chargé AVANT la collecte des `describe` : `Original · …` lit le catalogue des contrôles d'appel, que le lecteur du fil charge avec le panneau. */
await loadCallControlsCatalog('fr');

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

describe('« Original · … » sous chaque phrase traduite, après l’appel (#17340, #17878 A1.8, A2.3)', () => {
  const originalLines = (html: string): readonly string[] => [...html.matchAll(/data-call-transcript-original-line=""[^>]*>(.*?)<\/span>\s*<\/li>/g)].map((match) => match[0]);

  test('une phrase traduite porte son original dessous, étiqueté « Original · »', () => {
    const html = render([line()]);
    expect(html).toContain('data-call-transcript-original-line=""');
    expect(html).toMatch(/Original · <span[^>]*data-call-original-text="">Can you hear me\?<\/span>/);
  });

  test('l’original se lit à l’encre secondaire du FIL, jamais à celle du verre d’appel', () => {
    const html = render([line()]);
    const entry = html.split('data-call-transcript-original-line=""')[0]?.split('<span').pop() ?? '';
    expect(entry).toContain('color:var(--color-ios-ink-2)');
    expect(html).not.toContain('--color-on-media-3');
  });

  test('ma phrase et une phrase non traduite n’ont pas de ligne « Original · »', () => {
    const html = render([line({ id: 's-2', speakerId: 'u-moi', speakerName: 'Moi', mine: true, text: 'Oui', original: 'Oui', translated: false }), line({ id: 's-3', translated: false, text: 'Hello', original: 'Hello', language: 'en' })]);
    expect(html).not.toContain('data-call-transcript-original-line');
  });

  test('la bascule « Voir l’original » remplace la traduction, sans doubler la ligne', () => {
    const html = render([line()], true);
    expect(html).not.toContain('data-call-transcript-original-line');
    expect(html).toMatch(/data-call-transcript-text="original"[^>]*>Can you hear me\?</);
  });

  test('chaque phrase traduite a SA ligne', () => {
    const html = render([line(), line({ id: 's-4', original: 'Hi', text: 'Salut' })]);
    expect(originalLines(html)).toHaveLength(2);
  });
});

describe('les mots du journal, dans les sept langues (#17878 A1.3, A1.13)', () => {
  const shown: Readonly<Record<string, string>> = { fr: 'Afficher la transcription', en: 'Show transcript', es: 'Mostrar la transcripción', de: 'Transkript anzeigen', it: 'Mostra la trascrizione', pt: 'Mostrar a transcrição', ar: 'إظهار النص المكتوب' };
  const empty: Readonly<Record<string, string>> = { fr: 'Aucune transcription', en: 'No transcript', es: 'Sin transcripción', de: 'Keine Transkription', it: 'Nessuna trascrizione', pt: 'Sem transcrição', ar: 'لا يوجد تفريغ' };

  test('replié, la bascule dit « Afficher la transcription » ; vide, le journal dit « Aucune transcription » — comme iOS et Android', async () => {
    expect([...SUPPORTED_INTERFACE_LANGUAGES].sort()).toEqual(Object.keys(shown).sort());
    for (const language of SUPPORTED_INTERFACE_LANGUAGES) {
      await loadInterfaceCatalog(language);
      expect(translate(language, 'callTranscript.show')).toBe(shown[language] ?? '');
      expect(translate(language, 'callTranscript.empty')).toBe(empty[language] ?? '');
    }
  });
});
