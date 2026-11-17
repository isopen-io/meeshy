import { beforeAll, describe, expect, test } from 'bun:test';

import { loadLinkFamiliesCatalog } from '@/lib/i18n-link-families-catalog';

import { addressHost, hubFigure, hubFigureCaption } from './hub-face';

beforeAll(async () => {
  await Promise.all([loadLinkFamiliesCatalog('fr'), loadLinkFamiliesCatalog('en')]);
});

describe('la face Liens', () => {
  test('une adresse se lit sans schéma ni « www. », sans barre finale', () => {
    expect(addressHost('https://www.aissandiaye.studio/')).toBe('aissandiaye.studio');
    expect(addressHost('https://soundcloud.com/aissa')).toBe('soundcloud.com/aissa');
    expect(addressHost('pas une url')).toBe('pas une url');
  });

  test('le chiffre d’une famille : « — » absent, jamais « 0 » inventé', () => {
    expect(hubFigure('fr', 1284)?.replace(/\s/gu, ' ')).toBe('1 284');
    expect(hubFigure('fr', null)).toBeNull();
    expect(hubFigure('fr', 0)).toBe('0');
  });

  test('le mot sous le chiffre s’accorde au nombre, dans la langue de l’interface', () => {
    expect(hubFigureCaption('fr', 'tracking', 1)).toBe('clic');
    expect(hubFigureCaption('fr', 'tracking', 1284)).toBe('clics');
    expect(hubFigureCaption('fr', 'community', 1)).toBe('communauté');
    expect(hubFigureCaption('fr', 'share', 1)).toBe('arrivée');
    expect(hubFigureCaption('en', 'tracking', 1)).toBe('click');
    expect(hubFigureCaption('en', 'tracking', 0)).toBe('clicks');
  });
});
