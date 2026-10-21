import { describe, expect, test } from 'bun:test';

import { OPEN_ORIGINS } from '@meeshy/shared/types/content-reach';
import { CONTENT_SURFACES } from '@meeshy/shared/types/content-surfaces';

import { SWIPED_REEL, entryAttribution, openLinkSearch, openOriginOfSurface, viewFieldsOf, viewProvenanceOf } from './content-open';

/**
 * D'OÙ VIENT UNE VUE (#10483) — la loi PURE qui dit, à l'ouverture d'un écran
 * détail, ce qui l'a amené : un tap dans un listing, une notification, un lien
 * de suivi, un lien de partage, un lien venu d'ailleurs, ou rien.
 */
const OWN = 'https://meeshy.me';
const of = (query: string, referrer = '') => viewProvenanceOf(new URLSearchParams(query), referrer, [OWN, 'https://localhost']);

describe('viewProvenanceOf — la provenance d’une vue', () => {
  test('ouvert d’un tap dans le fil ⇒ listing, origine feed', () => {
    expect(of('from=feed')).toEqual({ provenance: 'listing', origin: 'feed' });
  });

  test('chaque listing connu est une origine', () => {
    for (const origin of OPEN_ORIGINS) expect(of(`from=${origin}`)).toEqual({ provenance: 'listing', origin });
  });

  test('une notification ⇒ notification', () => {
    expect(of('from=notification')).toEqual({ provenance: 'notification' });
  });

  test('arrivé par /l/<jeton> ⇒ tracking_link, même avec ?via=', () => {
    expect(of('via=abc123&from=tracking_link')).toEqual({ provenance: 'tracking_link' });
  });

  test('?via=<jeton> sans passage par /l/ ⇒ shared_link', () => {
    expect(of('via=abc123')).toEqual({ provenance: 'shared_link' });
  });

  test('un référent d’une autre origine, sans marque ⇒ external', () => {
    expect(of('', 'https://www.google.com/search?q=meeshy')).toEqual({ provenance: 'external' });
  });

  test('sans référent ⇒ direct ; le référent de Meeshy lui-même ⇒ direct', () => {
    expect(of('')).toEqual({ provenance: 'direct' });
    expect(of('', `${OWN}/feed`)).toEqual({ provenance: 'direct' });
    expect(of('', 'https://localhost/feed')).toEqual({ provenance: 'direct' });
  });

  test('une marque INCONNUE ne s’invente pas en origine : le reste de la loi décide', () => {
    expect(of('from=ailleurs')).toEqual({ provenance: 'direct' });
    expect(of('from=ailleurs', 'https://x.com/')).toEqual({ provenance: 'external' });
  });

  test('un référent illisible est traité comme absent', () => {
    expect(of('', 'pas une adresse')).toEqual({ provenance: 'direct' });
  });
});

describe('viewFieldsOf — ce que la vue porte sur le fil', () => {
  test('l’origine ne voyage qu’avec la provenance listing', () => {
    expect(viewFieldsOf({ provenance: 'listing', origin: 'profile' })).toEqual({ provenance: 'listing', origin: 'profile' });
    expect(viewFieldsOf({ provenance: 'external' })).toEqual({ provenance: 'external' });
  });
});

describe('openOriginOfSurface — le listing d’une surface', () => {
  test('les surfaces de listing sont des origines, les écrans plein cadre n’en sont pas', () => {
    for (const surface of CONTENT_SURFACES) {
      const origin = openOriginOfSurface(surface);
      if (surface === 'detail' || surface === 'story' || surface === 'visitor') expect(origin).toBeNull();
      else expect(origin).toBe(surface as (typeof OPEN_ORIGINS)[number]);
    }
  });
});

describe('openLinkSearch — l’adresse d’un tap porte son listing', () => {
  test('une origine ⇒ ?from=<origine> ; aucune ⇒ rien', () => {
    expect(openLinkSearch('hashtag')).toEqual({ from: 'hashtag' });
    expect(openLinkSearch(null)).toEqual({});
  });
});

describe('entryAttribution — un lecteur qui enchaîne', () => {
  test('le premier contenu porte la provenance d’entrée, les suivants celle du balayage', () => {
    const of = entryAttribution({ provenance: 'listing', origin: 'feed' }, SWIPED_REEL);
    expect(of('r1')).toEqual({ provenance: 'listing', origin: 'feed' });
    expect(of('r2')).toEqual({ provenance: 'listing', origin: 'reels' });
    expect(of('r3')).toEqual({ provenance: 'listing', origin: 'reels' });
    expect(of('r1')).toEqual({ provenance: 'listing', origin: 'feed' });
  });
});
