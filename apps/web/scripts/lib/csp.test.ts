import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';

import { INLINE_INTERFACE_LANGUAGE_BOOTSTRAP } from '../../src/lib/inline-interface-language-bootstrap.js';
import { INLINE_APP_SCHEME_BOOTSTRAP, INLINE_SCHEME_BOOTSTRAP } from '../../src/lib/inline-scheme-bootstrap.js';

import { NGINX_CSP_REGION, documentPolicy, inlineScriptHashes, nginxScriptHashes, scriptHash, withNginxScriptHashes } from './csp.mjs';

/**
 * **LA POLITIQUE DE SÉCURITÉ DU CONTENU DE L'ORIGINE** (#18986).
 *
 * L'origine qui tiendra les clés E2EE du navigateur ne servait ni CSP ni HSTS.
 * La politique vit dans `nginx.conf` (elle voyage avec l'image : staging,
 * production et sites installés la reçoivent ensemble) ; ses CONDENSATS de
 * scripts en ligne ne peuvent pas être devinés — ils se calculent sur les
 * documents construits. Ces témoins gardent le calcul ; `check-csp-hashes.mjs`
 * le confronte au `dist/` réel, `check-csp.mjs` à Chromium.
 */
const NGINX = readFileSync(new URL('../../nginx.conf', import.meta.url), 'utf8');

describe('inlineScriptHashes — ce qui S’EXÉCUTE en ligne, et seulement cela', () => {
  test('un script classique en ligne est condensé sur son texte exact (SHA-256, base64)', () => {
    expect(inlineScriptHashes('<head><script>alert(1)</script></head>')).toEqual([scriptHash('alert(1)')]);
    expect(scriptHash('alert(1)')).toBe("'sha256-bhHHL3z2vDgxUt0W3dWQOrprscmda2Y5pLsLg4GF+pI='");
  });

  test('un module en ligne s’exécute aussi : il est condensé', () => {
    expect(inlineScriptHashes('<script type="module">go()</script>')).toEqual([scriptHash('go()')]);
  });

  test('une donnée (JSON-LD, JSON) ne s’exécute pas : aucun condensat', () => {
    expect(inlineScriptHashes('<script type="application/ld+json">{"@type":"Organization"}</script><script type="application/json">{}</script>')).toEqual([]);
  });

  test('un script EXTERNE relève de `script-src`, pas d’un condensat', () => {
    expect(inlineScriptHashes('<script src="/assets/a.js"></script><script type="module" crossorigin src="/assets/b.js"></script>')).toEqual([]);
  });

  test('les doublons se comptent une fois, dans un ordre stable', () => {
    expect(inlineScriptHashes('<script>b()</script><script>a()</script><script>b()</script>')).toEqual([scriptHash('a()'), scriptHash('b()')].sort());
  });
});

describe('nginx.conf — la région des condensats', () => {
  test('elle se lit, et se réécrit sans toucher au reste du fichier', () => {
    const rewritten = withNginxScriptHashes(NGINX, [scriptHash('x()'), scriptHash('y()')]);

    expect(nginxScriptHashes(rewritten)).toEqual([scriptHash('x()'), scriptHash('y()')].sort());
    expect(rewritten.replace(NGINX_CSP_REGION, '')).toBe(NGINX.replace(NGINX_CSP_REGION, ''));
  });

  test('les trois amorces écrites dans le dépôt y figurent — une amorce modifiée sans son condensat rougit ici', () => {
    const declared = nginxScriptHashes(NGINX);
    for (const bootstrap of [INLINE_APP_SCHEME_BOOTSTRAP, INLINE_SCHEME_BOOTSTRAP, INLINE_INTERFACE_LANGUAGE_BOOTSTRAP]) {
      expect(declared).toContain(scriptHash(bootstrap));
    }
  });

  test('la page « mettez à jour la WebView » (`public/`, recopiée telle quelle) y figure', () => {
    const page = readFileSync(new URL('../../public/webview-update.html', import.meta.url), 'utf8');
    for (const hash of inlineScriptHashes(page)) expect(nginxScriptHashes(NGINX)).toContain(hash);
  });
});

describe('la politique servie aux documents', () => {
  const policy = documentPolicy(NGINX, { forwardedProto: 'https' });
  const directive = (name: string): string => policy.split(';').map((part) => part.trim()).find((part) => part.startsWith(`${name} `)) ?? '';

  test('les scripts : l’origine, le WebAssembly du pont libsignal, et les condensats — jamais `unsafe-eval` ni `unsafe-inline`', () => {
    const scripts = directive('script-src');
    expect(scripts.startsWith("script-src 'self' 'wasm-unsafe-eval'")).toBe(true);
    expect(scripts).not.toContain("'unsafe-eval'");
    expect(scripts).not.toContain("'unsafe-inline'");
    expect(scripts).not.toMatch(/https?:/);
    for (const hash of nginxScriptHashes(NGINX)) expect(scripts).toContain(hash);
  });

  test('ni plugin, ni base réécrite, ni cadrage par un tiers', () => {
    expect(directive('object-src')).toBe("object-src 'none'");
    expect(directive('base-uri')).toBe("base-uri 'none'");
    expect(directive('frame-ancestors')).toBe("frame-ancestors 'none'");
    expect(directive('default-src')).toBe("default-src 'self'");
  });

  test('elle tient sur une ligne : un en-tête HTTP ne porte aucun retour à la ligne', () => {
    expect(policy).not.toMatch(/[\r\n]/);
    expect(/\nmap [^\n]*\$meeshy_csp_script_hashes \{\n {4}default "[^"\n]*";\n\}/.test(NGINX)).toBe(true);
  });

  test('derrière TLS, aucune connexion en clair ; un site installé en HTTP garde la sienne', () => {
    expect(directive('connect-src')).not.toMatch(/\bhttp:|\bws:/);
    const cleartext = documentPolicy(NGINX, { forwardedProto: undefined });
    expect(cleartext).toMatch(/connect-src [^;]*\bhttp: ws:/);
  });
});

describe('nginx.conf — chaque réponse porte la politique (nginx n’hérite plus du serveur)', () => {
  const blocks = [...NGINX.matchAll(/\n {4}location ([^\n]*)\{\n([\s\S]*?)\n {4}\}/g)].map((m) => ({ location: (m[1] ?? '').trim(), body: m[2] ?? '' }));
  const CSP_LINE = 'add_header Content-Security-Policy $meeshy_csp always;';
  const ASSETS_ONLY = ['/assets/', '/og/'];

  test('le serveur la pose, et toute location qui pose un en-tête la repose — hormis les actifs, qui ne sont pas des documents', () => {
    expect(NGINX).toMatch(/\n {4}add_header Content-Security-Policy \$meeshy_csp always;\n/);
    const bare = blocks
      .filter(({ location, body }) => body.includes('add_header') && !ASSETS_ONLY.includes(location) && !body.includes(CSP_LINE))
      .map(({ location }) => location);
    expect(bare).toEqual([]);
  });

  test('les actifs n’en portent pas : un Worker reçoit la politique de SA réponse, et le moteur de traduction tiers ne vit qu’en Worker', () => {
    for (const location of ASSETS_ONLY) {
      expect(blocks.find((block) => block.location === location)?.body ?? '').not.toContain('Content-Security-Policy');
    }
  });
});

/**
 * LE TRANSPORT : HSTS ET SES VOISINS SONT POSÉS PAR TRAEFIK, qui termine le TLS
 * (#18986). Le middleware `secure-headers` existait (`config/dynamic.yaml`) et
 * n'était branché sur AUCUN routeur : l'origine n'envoyait ni HSTS, ni
 * `nosniff`, ni anti-cadrage.
 */
describe('Traefik — les routeurs de l’application posent les en-têtes de transport', () => {
  const compose = (name: string): string => readFileSync(new URL(`../../../../infrastructure/docker/compose/${name}`, import.meta.url), 'utf8');
  const middlewares = (file: string, router: string): string[] =>
    (new RegExp(`traefik\\.http\\.routers\\.${router}\\.middlewares=([^"\\n]*)`).exec(compose(file))?.[1] ?? '').split(',');

  test('production et staging branchent `secure-headers@file` sur le routeur de la webapp', () => {
    expect(middlewares('docker-compose.prod.yml', 'frontend')).toContain('secure-headers@file');
    expect(middlewares('docker-compose.staging.yml', 'frontend-staging')).toContain('secure-headers@file');
  });

  test('le middleware porte HSTS (un an, sous-domaines) et `nosniff`', () => {
    const dynamic = compose('config/dynamic.yaml');
    const headers = /\n {4}secure-headers:\n {6}headers:\n([\s\S]*?)\n\n/.exec(dynamic)?.[1] ?? '';
    expect(headers).toContain('stsSeconds: 31536000');
    expect(headers).toContain('stsIncludeSubdomains: true');
    expect(headers).toContain('forceSTSHeader: true');
    expect(headers).toContain('contentTypeNosniff: true');
  });
});
