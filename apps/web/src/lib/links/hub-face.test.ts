import { describe, expect, test } from 'bun:test';

import { addressHost, hubFigure } from './hub-face';

describe('la face Liens', () => {
  test('une adresse se lit sans schéma ni « www. », sans barre finale', () => {
    expect(addressHost('https://www.aissandiaye.studio/')).toBe('aissandiaye.studio');
    expect(addressHost('https://soundcloud.com/aissa')).toBe('soundcloud.com/aissa');
    expect(addressHost('pas une url')).toBe('pas une url');
  });

  test('le chiffre d’une famille : « — » absent, jamais « 0 » inventé', () => {
    expect(hubFigure('fr', 1284)).toBe('1 284');
    expect(hubFigure('fr', null)).toBeNull();
    expect(hubFigure('fr', 0)).toBe('0');
  });
});
