import { describe, expect, test } from 'bun:test';

import { segmentText } from '@meeshy/shared/utils/text-segments';

import { displaySegments, resolveLinkDisplay, type DisplaySegment } from './link-display';

const MAP = [{ url: 'https://exemple.test/a', token: 'Tok123' }] as const;

describe('resolveLinkDisplay — la loi des quatre formes écrites (#9093)', () => {
  test('[[url]] s’affiche tel quel et s’ouvre en DIRECT, même si la carte la suit', () => {
    expect(resolveLinkDisplay({ form: 'verbatim', url: 'https://exemple.test/a' }, MAP)).toEqual({
      text: 'https://exemple.test/a',
      href: 'https://exemple.test/a',
      tracked: false,
    });
  });

  test('[libellé](url) montre le libellé et passe par /l/<token> quand la carte a l’adresse', () => {
    expect(resolveLinkDisplay({ form: 'labelled', label: 'le doc', url: 'https://exemple.test/a' }, MAP)).toEqual({
      text: 'le doc',
      href: '/l/Tok123',
      tracked: true,
      token: 'Tok123',
    });
  });

  test('[libellé](url) absente de la carte s’ouvre en direct, libellé conservé', () => {
    expect(resolveLinkDisplay({ form: 'labelled', label: 'le doc', url: 'https://ailleurs.test' }, MAP)).toEqual({
      text: 'le doc',
      href: 'https://ailleurs.test',
      tracked: false,
    });
  });

  test('une URL brute suivie s’affiche m+<token> et passe par /l/<token>', () => {
    expect(resolveLinkDisplay({ form: 'bare', text: 'https://exemple.test/a', url: 'https://exemple.test/a' }, MAP)).toEqual({
      text: 'm+Tok123',
      href: '/l/Tok123',
      tracked: true,
      token: 'Tok123',
    });
  });

  test('une URL brute absente de la carte garde son adresse affichée, lien direct', () => {
    expect(resolveLinkDisplay({ form: 'bare', text: 'www.ailleurs.test', url: 'https://www.ailleurs.test' }, MAP)).toEqual({
      text: 'www.ailleurs.test',
      href: 'https://www.ailleurs.test',
      tracked: false,
    });
  });

  test('m+<token> historique reste LITTÉRAL et passe par /l/<token>', () => {
    expect(resolveLinkDisplay({ form: 'short', token: 'Ab12cd' }, undefined)).toEqual({
      text: 'm+Ab12cd',
      href: '/l/Ab12cd',
      tracked: true,
      token: 'Ab12cd',
    });
  });

  test('un token hostile dans la carte n’est jamais posé dans une adresse', () => {
    const hostile = [{ url: 'https://exemple.test/a', token: '../admin' }];
    expect(resolveLinkDisplay({ form: 'bare', text: 'https://exemple.test/a', url: 'https://exemple.test/a' }, hostile).tracked).toBe(false);
  });
});

const links = (segments: readonly DisplaySegment[]): readonly unknown[] =>
  segments.flatMap((segment) => {
    if (segment.kind === 'link') return [segment.display];
    if (segment.kind === 'emphasis') return links(segment.children);
    return [];
  });

const texts = (segments: readonly DisplaySegment[]): string =>
  segments
    .map((segment) => {
      if (segment.kind === 'link') return segment.display.text;
      if (segment.kind === 'emphasis') return texts(segment.children);
      return 'text' in segment ? segment.text : '';
    })
    .join('');

describe('displaySegments — le texte écrit, lu par la loi', () => {
  const run = (content: string) => displaySegments(segmentText(content, { trackingLinks: MAP }), MAP);

  test('les trois formes dans une même phrase', () => {
    const shown = run('a [[https://exemple.test/a]] b [doc](https://exemple.test/a) c https://exemple.test/a.');
    expect(texts(shown)).toBe('a https://exemple.test/a b doc c m+Tok123.');
    expect(links(shown)).toEqual([
      { text: 'https://exemple.test/a', href: 'https://exemple.test/a', tracked: false },
      { text: 'doc', href: '/l/Tok123', tracked: true, token: 'Tok123' },
      { text: 'm+Tok123', href: '/l/Tok123', tracked: true, token: 'Tok123' },
    ]);
  });

  test('[[url]] dans une emphase perd aussi ses crochets', () => {
    expect(texts(run('**[[https://exemple.test/a]]**'))).toBe('https://exemple.test/a');
  });

  test('un crochet isolé n’est pas une forme verbatim', () => {
    expect(texts(run('[https://exemple.test/a]'))).toBe('[m+Tok123]');
  });
});
