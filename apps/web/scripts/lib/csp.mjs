import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * **LA POLITIQUE DE SÉCURITÉ DU CONTENU DE L'ORIGINE, ÉCRITE UNE FOIS** (#18986).
 *
 * L'origine qui tiendra les clés E2EE du navigateur ne servait ni CSP ni HSTS :
 * toute injection lisait le JWT, et UTILISERAIT demain le coffre (une `CryptoKey`
 * non extractible s'emploie même si elle ne s'exporte pas). La politique vit
 * dans `nginx.conf` — elle voyage avec l'image, staging, production et sites
 * installés la reçoivent ensemble — sous la forme de trois `map` :
 *
 *  - `$meeshy_csp_script_hashes`, la RÉGION écrite par
 *    `node scripts/check-csp-hashes.mjs --write` : les condensats SHA-256 des
 *    scripts en ligne de CHAQUE document construit (les deux amorces de la
 *    coquille, celle des pages institutionnelles, le démarrage de chaque
 *    landing, la page « mettez à jour la WebView »). Un condensat ne se devine
 *    pas : il se CALCULE sur `dist/`, et la garde rougit dès qu'un document
 *    change sans lui ;
 *  - `$meeshy_csp_cleartext`, vide derrière TLS (`X-Forwarded-Proto: https`,
 *    posé par Traefik), `http: ws:` pour un site installé sans TLS ;
 *  - `$meeshy_csp`, la politique, qui compose les deux.
 *
 * Ce module est lu par trois sites : les témoins (`csp.test.ts`), la garde de
 * construction (`check-csp-hashes.mjs`) et la garde navigateur
 * (`check-csp.mjs`), qui sert `dist/` avec EXACTEMENT ce que nginx enverrait.
 */

/** La région de `nginx.conf` que `--write` réécrit, et elle seule. */
export const NGINX_CSP_REGION = /(# DÉBUT condensats-csp[^\n]*\n)[\s\S]*?(\n# FIN condensats-csp)/;

const EXECUTABLE_TYPES = new Set(['', 'text/javascript', 'application/javascript', 'module']);

/** Le jeton CSP du condensat d'un script en ligne : SHA-256 de son texte EXACT. */
export const scriptHash = (body) => `'sha256-${createHash('sha256').update(body, 'utf8').digest('base64')}'`;

/** Les condensats des scripts en ligne qui S'EXÉCUTENT dans un document (une donnée JSON n'en a pas besoin). */
export const inlineScriptHashes = (html) => {
  const hashes = [...html.matchAll(/<script(?![^>]*\ssrc=)([^>]*)>([\s\S]*?)<\/script>/g)]
    .filter(([, attributes = '']) => EXECUTABLE_TYPES.has((/\stype="([^"]*)"/.exec(attributes)?.[1] ?? '').toLowerCase()))
    .map(([, , body = '']) => scriptHash(body));
  return [...new Set(hashes)].sort();
};

const htmlFiles = (dir) =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return htmlFiles(path);
    return entry.name.endsWith('.html') ? [path] : [];
  });

/** Les condensats de TOUS les documents d'un `dist/` construit. */
export const distScriptHashes = (dist) => [...new Set(htmlFiles(dist).flatMap((file) => inlineScriptHashes(readFileSync(file, 'utf8'))))].sort();

/** Les condensats que `nginx.conf` déclare. */
export const nginxScriptHashes = (nginx) => {
  const region = NGINX_CSP_REGION.exec(nginx)?.[0];
  if (region === undefined) throw new Error('nginx.conf : région « condensats-csp » introuvable');
  return [...region.matchAll(/'sha256-[A-Za-z0-9+/=]+'/g)].map(([hash]) => hash).sort();
};

/**
 * `nginx.conf` avec une autre liste de condensats — le reste du fichier à
 * l'octet près. La valeur tient sur UNE ligne : nginx garde les retours à la
 * ligne d'une chaîne entre guillemets, et un en-tête HTTP qui en porte est une
 * réponse malformée.
 */
export const withNginxScriptHashes = (nginx, hashes) => {
  if (!NGINX_CSP_REGION.test(nginx)) throw new Error('nginx.conf : région « condensats-csp » introuvable');
  const map = ['map "" $meeshy_csp_script_hashes {', `    default "${[...new Set(hashes)].sort().join(' ')}";`, '}'].join('\n');
  return nginx.replace(NGINX_CSP_REGION, (_whole, start, end) => `${start}${map}${end}`);
};

const mapBody = (nginx, variable) => {
  const body = new RegExp(`\\nmap [^\\n]*\\$${variable} \\{\\n([\\s\\S]*?)\\n\\}`).exec(nginx)?.[1];
  if (body === undefined) throw new Error(`nginx.conf : map $${variable} introuvable`);
  return body;
};

const mapValue = (body, key) => {
  const line = body.split('\n').find((candidate) => candidate.trim().startsWith(`${key} `));
  return /"([^"]*)"/.exec(line ?? '')?.[1] ?? '';
};

/**
 * LA POLITIQUE QUE NGINX ENVOIE À UN DOCUMENT, variables résolues — celle que
 * la garde navigateur sert. `forwardedProto` est ce que Traefik pose
 * (`https`), absent sur un site installé sans proxy TLS.
 */
export const documentPolicy = (nginx, { forwardedProto }) => {
  const policy = /"([\s\S]*)"/.exec(mapBody(nginx, 'meeshy_csp'))?.[1] ?? '';
  const cleartextBody = mapBody(nginx, 'meeshy_csp_cleartext');
  const cleartext = mapValue(cleartextBody, forwardedProto === 'https' ? 'https' : 'default');
  return policy
    .replaceAll('$meeshy_csp_script_hashes', nginxScriptHashes(nginx).join(' '))
    .replaceAll('$meeshy_csp_cleartext', cleartext)
    .replace(/\s+/g, ' ')
    .trim();
};
