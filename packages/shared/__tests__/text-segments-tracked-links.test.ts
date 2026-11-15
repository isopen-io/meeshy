/**
 * LES LIENS DE SUIVI DANS UN TEXTE ÉCRIT PAR QUELQU'UN (#7827).
 *
 * La passerelle a DEUX façons de rendre un lien traçable, et le découpage doit
 * reconnaître les deux :
 *
 *  - `[[url]]` et `<url>` sont RÉÉCRITS dans le contenu en `m+<token>`
 *    (`TrackingLinkService.processExplicitLinksInContent`) — l'URL d'origine
 *    n'est plus dans le texte ;
 *  - une URL BRUTE reste intacte, et son `{ url, token }` est rangé dans
 *    `metadata.trackingLinks` (hissé en `trackingLinks` sur le socket) — le
 *    texte lisible est préservé, seul le lien SUIVI change.
 *
 * Référence iOS : `MessageTextRenderer.swift` (`meeshyLinkRegex`,
 * `resolvedLinkURL`).
 */
import { describe, expect, it } from 'vitest';

import { hasRichText, segmentText, trackingLinksOf } from '../utils/text-segments';

describe('segmentText — le lien court m+<token>', () => {
  it('découpe m+<token> en lien de suivi, sans URL d’origine connue', () => {
    expect(segmentText('regarde m+Ab12cd vite')).toEqual([
      { kind: 'text', text: 'regarde ' },
      { kind: 'tracked-link', text: 'm+Ab12cd', token: 'Ab12cd', url: null },
      { kind: 'text', text: ' vite' },
    ]);
  });

  it('laisse la ponctuation qui ferme la phrase au texte', () => {
    expect(segmentText('vois m+Ab12cd.')).toEqual([
      { kind: 'text', text: 'vois ' },
      { kind: 'tracked-link', text: 'm+Ab12cd', token: 'Ab12cd', url: null },
      { kind: 'text', text: '.' },
    ]);
  });

  it('accepte le jeu de caractères de la passerelle (tiret, tiret bas)', () => {
    expect(segmentText('m+a_b-c9')).toEqual([{ kind: 'tracked-link', text: 'm+a_b-c9', token: 'a_b-c9', url: null }]);
  });

  it('ne lit PAS un m+ collé à un mot (« am+abc », « M+ » majuscule)', () => {
    expect(segmentText('am+abc12')).toEqual([{ kind: 'text', text: 'am+abc12' }]);
    expect(segmentText('M+abc12')).toEqual([{ kind: 'text', text: 'M+abc12' }]);
  });

  it('ne lit PAS un token trop court (un seul caractère)', () => {
    expect(segmentText('m+a')).toEqual([{ kind: 'text', text: 'm+a' }]);
  });

  it('un m+ À L’INTÉRIEUR d’une URL reste dans l’URL', () => {
    expect(segmentText('https://ex.com/m+abc12')).toEqual([
      { kind: 'url', text: 'https://ex.com/m+abc12', href: 'https://ex.com/m+abc12' },
    ]);
  });

  it('survit à l’emphase', () => {
    expect(segmentText('**m+abc12**')).toEqual([
      {
        kind: 'emphasis',
        style: 'bold',
        children: [{ kind: 'tracked-link', text: 'm+abc12', token: 'abc12', url: null }],
      },
    ]);
  });

  it('rend le texte riche (hasRichText)', () => {
    expect(hasRichText('m+abc12')).toBe(true);
  });
});

describe('segmentText — l’URL brute suivie', () => {
  const trackingLinks = [{ url: 'https://meeshy.me/notes', token: 'Tok123' }];

  it('garde le texte affiché et porte le token quand l’URL figure dans trackingLinks', () => {
    expect(segmentText('lis https://meeshy.me/notes', { trackingLinks })).toEqual([
      { kind: 'text', text: 'lis ' },
      { kind: 'tracked-link', text: 'https://meeshy.me/notes', token: 'Tok123', url: 'https://meeshy.me/notes' },
    ]);
  });

  it('retrouve l’URL que la passerelle a enregistrée AVEC sa ponctuation finale', () => {
    const withDot = [{ url: 'https://meeshy.me/notes.', token: 'Tok123' }];
    expect(segmentText('lis https://meeshy.me/notes.', { trackingLinks: withDot })).toEqual([
      { kind: 'text', text: 'lis ' },
      { kind: 'tracked-link', text: 'https://meeshy.me/notes', token: 'Tok123', url: 'https://meeshy.me/notes' },
      { kind: 'text', text: '.' },
    ]);
  });

  it('une URL absente de trackingLinks reste un lien externe ordinaire', () => {
    expect(segmentText('https://autre.org/a', { trackingLinks })).toEqual([
      { kind: 'url', text: 'https://autre.org/a', href: 'https://autre.org/a' },
    ]);
  });

  it('ignore une entrée dont le token n’a pas la forme d’un token', () => {
    const hostile = [{ url: 'https://meeshy.me/notes', token: '../admin' }];
    expect(segmentText('https://meeshy.me/notes', { trackingLinks: hostile })).toEqual([
      { kind: 'url', text: 'https://meeshy.me/notes', href: 'https://meeshy.me/notes' },
    ]);
  });
});

describe('trackingLinksOf — le décodage fail-safe de ce que sert la passerelle', () => {
  it('lit le champ HISSÉ du socket en priorité', () => {
    expect(
      trackingLinksOf({
        trackingLinks: [{ url: 'https://a.io', token: 'abc12' }],
        metadata: { trackingLinks: [{ url: 'https://b.io', token: 'zzz99' }] },
      }),
    ).toEqual([{ url: 'https://a.io', token: 'abc12' }]);
  });

  it('retombe sur metadata.trackingLinks (REST)', () => {
    expect(trackingLinksOf({ metadata: { trackingLinks: [{ url: 'https://b.io', token: 'zzz99' }] } })).toEqual([
      { url: 'https://b.io', token: 'zzz99' },
    ]);
  });

  it('écarte toute entrée mal formée sans lever', () => {
    expect(
      trackingLinksOf({
        metadata: {
          trackingLinks: [
            null,
            'x',
            { url: 42, token: 'abc12' },
            { url: 'https://ok.io', token: 'ok123', extra: true },
            { url: 'https://ok.io', token: 'a b' },
            { url: 'javascript:alert(1)', token: 'abc12' },
          ],
        },
      }),
    ).toEqual([{ url: 'https://ok.io', token: 'ok123' }]);
  });

  it('rend une liste vide sur null, un metadata non objet ou un champ non tableau', () => {
    expect(trackingLinksOf({ metadata: null })).toEqual([]);
    expect(trackingLinksOf({ metadata: 'x', trackingLinks: null })).toEqual([]);
    expect(trackingLinksOf({ trackingLinks: { url: 'https://a.io', token: 'abc12' } })).toEqual([]);
    expect(trackingLinksOf({})).toEqual([]);
  });
});
