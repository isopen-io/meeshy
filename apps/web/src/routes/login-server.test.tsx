import { renderToStaticMarkup } from 'react-dom/server';
import { beforeAll, describe, expect, test } from 'bun:test';

import { loadInterfaceCatalog } from '@/lib/i18n-catalog';
import { LoginDoors, loginServerLabel } from '@/routes/login';

/**
 * LE SERVEUR DE L'ÉCRAN DE CONNEXION (#8287) — miroir du sélecteur iOS,
 * réservé au simulateur : le web ne le montre qu'en DÉVELOPPEMENT local,
 * jamais dans un build de production.
 */

beforeAll(async () => {
  await loadInterfaceCatalog('fr');
});

describe('loginServerLabel', () => {
  test('rien hors développement', () => {
    expect(loginServerLabel({ dev: false, base: 'https://gate.meeshy.me/api/v1', proxyTarget: 'https://gate.staging.meeshy.me' })).toBeNull();
    expect(loginServerLabel({ dev: undefined, base: '', proxyTarget: 'https://gate.staging.meeshy.me' })).toBeNull();
  });

  test('en développement, la cible du proxy quand la base est relative', () => {
    expect(loginServerLabel({ dev: true, base: '', proxyTarget: 'https://gate.staging.meeshy.me' })).toBe('https://gate.staging.meeshy.me');
  });

  test('en développement, l’origine de la base quand elle est absolue', () => {
    expect(loginServerLabel({ dev: true, base: 'http://localhost:3000/api/v1', proxyTarget: 'x' })).toBe('http://localhost:3000');
  });
});

describe('l’écran de connexion', () => {
  test('ne montre aucun serveur par défaut', () => {
    const html = renderToStaticMarkup(<LoginDoors method="password" />);
    expect(html).not.toContain('Connecté à');
  });

  test('montre le serveur quand on le lui donne (développement)', () => {
    const html = renderToStaticMarkup(<LoginDoors method="password" serverLabel="https://gate.staging.meeshy.me" />);
    expect(html).toContain('Connecté à : https://gate.staging.meeshy.me');
  });
});
