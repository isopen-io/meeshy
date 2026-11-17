import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';

import { RUNTIME_CONFIG_PATH, decodeRuntimeConfig, readRuntimeConfig, withRuntimeConfigPrefetch } from './runtime-config';

/**
 * **LA CONFIGURATION DU DÉPLOIEMENT EST UNE DONNÉE, JAMAIS UN SCRIPT** (#18988).
 *
 * `/config.js` était un script CLASSIQUE et bloquant, servi par le service
 * worker depuis un seau que tout script de l'origine peut réécrire : une
 * seule exécution de code y déposait un `/config.js` piégé qui s'exécutait
 * ensuite dans la PAGE à chaque chargement (contre-analyse du 2026-11-17,
 * WEBX-01, prouvé dans Chromium). La configuration se LIT désormais par
 * `fetch` et se DÉCODE : ce qu'elle porte ne peut plus rien exécuter, et ce
 * qui n'a pas sa forme est ignoré.
 */
describe('decodeRuntimeConfig — ce qui n’a pas la forme est ignoré, jamais réparé', () => {
  test('les deux origines déclarées traversent telles quelles', () => {
    expect(decodeRuntimeConfig({ apiUrl: 'https://api.acme.fr', webUrl: 'https://chat.acme.fr' })).toEqual({
      apiUrl: 'https://api.acme.fr',
      webUrl: 'https://chat.acme.fr',
    });
  });

  test('un champ absent RESTE absent — jamais une clé posée à `undefined`', () => {
    expect(Object.keys(decodeRuntimeConfig({ apiUrl: 'https://api.acme.fr' }))).toEqual(['apiUrl']);
    expect(decodeRuntimeConfig({})).toEqual({});
  });

  test('ce qui n’est pas un objet ne déclare rien', () => {
    for (const raw of [null, undefined, 'https://api.acme.fr', 42, true, ['https://api.acme.fr']]) {
      expect(decodeRuntimeConfig(raw)).toEqual({});
    }
  });

  test('un champ qui n’est pas une chaîne est retiré, et un champ inconnu ne passe pas', () => {
    expect(decodeRuntimeConfig({ apiUrl: { toString: () => 'https://x' }, webUrl: 7, script: 'alert(1)' })).toEqual({});
  });
});

type Recorded = { readonly method: string; readonly url: string; readonly async: boolean };

const request = (outcome: { readonly status?: number; readonly body?: string; readonly fails?: boolean }, calls: Recorded[] = []) => () => ({
  status: 0,
  responseText: '',
  open(method: 'GET', url: string, async: false) {
    calls.push({ method, url, async });
  },
  send() {
    if (outcome.fails === true) throw new DOMException('NetworkError', 'NetworkError');
    this.status = outcome.status ?? 200;
    this.responseText = outcome.body ?? '';
  },
});

describe('readRuntimeConfig — lue comme une donnée, et toute panne vaut « rien de déclaré »', () => {
  test('elle lit `/config.json` sur l’origine de la page, en une lecture SYNCHRONE', () => {
    const calls: Recorded[] = [];

    expect(readRuntimeConfig(request({ body: '{"apiUrl":"https://api.acme.fr"}' }, calls))).toEqual({ apiUrl: 'https://api.acme.fr' });
    expect(calls).toEqual([{ method: 'GET', url: RUNTIME_CONFIG_PATH, async: false }]);
    expect(RUNTIME_CONFIG_PATH).toBe('/config.json');
  });

  test('un réseau coupé, un 404 ou un JSON illisible : rien de déclaré — la passerelle se déduit de l’hôte', () => {
    expect(readRuntimeConfig(request({ fails: true }))).toEqual({});
    expect(readRuntimeConfig(request({ status: 404, body: '{"apiUrl":"https://api.acme.fr"}' }))).toEqual({});
    expect(readRuntimeConfig(request({ body: 'window.__MEESHY_RUNTIME__ = {};' }))).toEqual({});
    expect(readRuntimeConfig(() => {
      throw new TypeError('XMLHttpRequest absent');
    })).toEqual({});
  });

  test('un script servi à la place de la donnée n’est jamais exécuté, seulement refusé', () => {
    let executed = false;
    (globalThis as { __pwned?: () => void }).__pwned = () => {
      executed = true;
    };

    expect(readRuntimeConfig(request({ body: '__pwned(); ({"apiUrl":"https://evil.example"})' }))).toEqual({});
    expect(executed).toBe(false);
  });
});

describe('le préchargement de la configuration', () => {
  test('la construction du web nu la demande dès le document, en parallèle du bundle', () => {
    expect(withRuntimeConfigPrefetch('<head><title>Meeshy</title></head>')).toBe(
      '<head><title>Meeshy</title><link rel="prefetch" href="/config.json" /></head>',
    );
  });
});

describe('le document ne charge plus aucun script de configuration (#18988)', () => {
  const html = readFileSync(new URL('../../../index.html', import.meta.url), 'utf8');

  test('`index.html` n’a plus de `<script src="/config.js">`', () => {
    expect(html).not.toMatch(/<script[^>]*src="\/config\.js"/);
  });

  test('`config.ts` lit la donnée par `readRuntimeConfig`, plus `window.__MEESHY_RUNTIME__`', () => {
    const config = readFileSync(new URL('./config.ts', import.meta.url), 'utf8');
    expect(config).toContain('readRuntimeConfig(');
    expect(config).not.toMatch(/runtime:\s*\(globalThis as/);
  });
});
