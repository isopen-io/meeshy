/**
 * Audit adversarial #9608, P5 — le journal d'une requête ne porte plus le lieu
 * que le client DÉCLARE.
 *
 * Le crochet d'identification de `server.ts` copiait `X-Meeshy-Country`,
 * `-City` et `-Region` dans chaque ligne de journal : un lieu écrit par
 * l'appelant (la région réglée dans iOS, une ville qu'il choisit) se lisait
 * dans les journaux comme une localisation. Seul le serveur décide du lieu
 * (#9608) ; le journal garde ce que le client est seul à savoir.
 *
 * @jest-environment node
 */

import { describe, it, expect } from '@jest/globals';
import { clientLogContext } from '../../../utils/client-log-context';

describe('clientLogContext', () => {
  it('garde version, build, plateforme, modèle, système, langue et fuseau', () => {
    expect(clientLogContext({
      'x-meeshy-version': '1.2.0', 'x-meeshy-build': '1874', 'x-meeshy-platform': 'ios',
      'x-meeshy-device': 'iPhone15,2', 'x-meeshy-os': '18.0', 'x-meeshy-locale': 'fr-FR',
      'x-meeshy-timezone': 'Europe/Paris',
    })).toEqual({
      appVersion: '1.2.0', appBuild: '1874', platform: 'ios', device: 'iPhone15,2',
      osVersion: '18.0', locale: 'fr-FR', timezone: 'Europe/Paris',
    });
  });

  it('ne journalise ni pays, ni ville, ni région déclarés par le client', () => {
    const contexte = clientLogContext({
      'x-meeshy-country': 'FR', 'x-meeshy-city': 'Paris', 'x-meeshy-region': 'IDF', 'x-meeshy-platform': 'ios',
    });
    expect(contexte).toEqual({ platform: 'ios' });
  });

  it('rien de déclaré : objet vide', () => {
    expect(clientLogContext({})).toEqual({});
  });
});
