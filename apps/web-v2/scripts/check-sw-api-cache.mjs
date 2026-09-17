#!/usr/bin/env node
/**
 * LE SEAU `api` DU SERVICE WORKER, MESURÉ SUR `dist/sw.js` (#6862).
 *
 * La lecture souveraine d'une conversation privée (#6862) a posé une règle —
 * « aucune réponse `/api/v1/admin/**` ne va sur le disque » — et l'a branchée
 * dans `vite.config.ts` en appelant `apiResponseMayBeCached`, importée. Son
 * témoin lisait `vite.config.ts` comme du TEXTE, et verdissait.
 *
 * Workbox ne COMPILE pas ce fichier : il STRINGIFIE le `urlPattern` reçu et
 * pose ce texte dans `dist/sw.js`. Le service worker livré portait donc
 *
 *     registerRoute(({url:s})=>apiResponseMayBeCached(s.pathname), …)
 *
 * sans la moindre définition d'`apiResponseMayBeCached`. Deux conséquences,
 * toutes deux PIRES que le défaut visé : la charge d'administration n'était
 * pas exclue, et le matcher jetait une `ReferenceError` à chaque requête GET
 * atteignant cette route — le seau `medias`, enregistré derrière lui, ne
 * matchait plus jamais.
 *
 * Ce gate n'interroge donc ni la source ni la configuration : il EXTRAIT le
 * matcher du seau `api` depuis l'artefact construit et le FAIT DÉCIDER, dans
 * un contexte nu. Un matcher qui dépend d'un identifiant que le service
 * worker ne définit pas rougit ici, et nulle part ailleurs.
 *
 * Vu ROUGIR sur l'artefact du 2026-09-17 (« matcher non autonome :
 * apiResponseMayBeCached is not defined ») ; vu VERDIR après passage du
 * `urlPattern` à une valeur SÉRIALISABLE.
 */
import { readFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { resolveDistDir } from './lib/resolve-dist-dir.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));

const ORIGINE = 'https://meeshy.me';
const PASSERELLE = 'https://gate.meeshy.me';

/** Les URL que le seau `api` doit REFUSER, et celles qu'il doit garder. */
const VERDICTS_ATTENDUS = [
  { href: `${ORIGINE}/api/v1/admin/conversations`, gardable: false },
  { href: `${ORIGINE}/api/v1/admin/conversations/c1/messages?limit=30`, gardable: false },
  { href: `${PASSERELLE}/api/v1/admin/users`, gardable: false },
  { href: `${PASSERELLE}/api/v1/admin/agent/scan-logs`, gardable: false },
  { href: `${ORIGINE}/api/v1/conversations`, gardable: true },
  { href: `${PASSERELLE}/api/v1/conversations/c1/messages`, gardable: true },
  { href: `${ORIGINE}/api/v1/users/administrateur`, gardable: true },
  { href: `${ORIGINE}/assets/app.js`, gardable: false },
];

/**
 * Découpe le PREMIER argument d'un appel `registerRoute(` à partir de l'index
 * qui suit sa parenthèse ouvrante, en comptant les niveaux et en sautant
 * chaînes, gabarits et littéraux d'expression régulière. Un `split(',')` ne
 * pouvait pas le faire : le matcher lui-même contient des virgules.
 */
export function decoupePremierArgument(source, depuis) {
  let profondeur = 0;
  let index = depuis;
  let precedentSignificatif = '(';

  while (index < source.length) {
    const c = source[index];

    if (c === '"' || c === "'" || c === '`') {
      index = finDeLitteral(source, index, c);
      precedentSignificatif = c;
      continue;
    }

    if (c === '/' && peutCommencerUneExpression(precedentSignificatif)) {
      index = finDeRegex(source, index);
      precedentSignificatif = '/';
      continue;
    }

    if (c === '(' || c === '[' || c === '{') profondeur += 1;
    if (c === ')' || c === ']' || c === '}') {
      if (profondeur === 0) return source.slice(depuis, index);
      profondeur -= 1;
    }
    if (c === ',' && profondeur === 0) return source.slice(depuis, index);

    if (!/\s/.test(c)) precedentSignificatif = c;
    index += 1;
  }

  return null;
}

function finDeLitteral(source, ouverture, delimiteur) {
  let index = ouverture + 1;
  while (index < source.length) {
    if (source[index] === '\\') {
      index += 2;
      continue;
    }
    if (source[index] === delimiteur) return index + 1;
    index += 1;
  }
  return source.length;
}

/**
 * Un littéral d'expression régulière se termine sur le `/` qui n'est ni
 * échappé ni DANS une classe de caractères : `[^/]`, que porte justement le
 * motif du seau `api`, aurait clos le littéral trois caractères trop tôt.
 */
function finDeRegex(source, ouverture) {
  let index = ouverture + 1;
  let dansClasse = false;

  while (index < source.length) {
    const c = source[index];

    if (c === '\\') {
      index += 2;
      continue;
    }
    if (dansClasse) {
      if (c === ']') dansClasse = false;
    } else if (c === '[') {
      dansClasse = true;
    } else if (c === '/') {
      index += 1;
      while (index < source.length && /[a-z]/.test(source[index])) index += 1;
      return index;
    }
    index += 1;
  }

  return source.length;
}

function peutCommencerUneExpression(precedent) {
  return '(,=:[!&|?{;+-*%<>~^'.includes(precedent);
}

/** Le matcher du seau dont `cacheName` vaut `nom`, tel que l'artefact le porte. */
export function matcherDuSeau(source, nom) {
  const marqueur = source.indexOf(`cacheName:"${nom}"`);
  if (marqueur === -1) return null;

  const appel = source.lastIndexOf('registerRoute(', marqueur);
  if (appel === -1) return null;

  return decoupePremierArgument(source, appel + 'registerRoute('.length);
}

/**
 * Fonction PURE : prend le TEXTE d'un service worker et rend la liste de ses
 * manquements. Exportée pour que son témoin la rejoue sur des artefacts
 * fabriqués — dont la forme fautive livrée le 2026-09-17.
 */
export function auditSeauApi(source) {
  const violations = [];
  const texte = matcherDuSeau(source, 'api');

  if (!texte) {
    return ['aucun seau `api` (`cacheName:"api"`) dans le service worker construit'];
  }

  let matcher;
  try {
    matcher = new Function(`"use strict"; return (${texte});`)();
  } catch (err) {
    return [`le matcher du seau \`api\` ne s'évalue pas : ${err.message} — texte : ${texte}`];
  }

  for (const { href, gardable } of VERDICTS_ATTENDUS) {
    let verdict;
    try {
      verdict = applique(matcher, href);
    } catch (err) {
      violations.push(
        `matcher NON AUTONOME sur ${href} : ${err.message}. ` +
          'Workbox stringifie le `urlPattern` — il ne peut dépendre d’aucun identifiant importé. ' +
          `Texte livré : ${texte}`,
      );
      break;
    }

    if (Boolean(verdict) !== gardable) {
      violations.push(
        gardable
          ? `${href} n'est plus gardé par le seau \`api\` — la v2 perd sa lecture hors ligne`
          : `${href} PART SUR LE DISQUE du poste (seau \`api\`, sept jours) — #6862 l'interdit`,
      );
    }
  }

  return violations;
}

function applique(matcher, href) {
  const url = new URL(href);
  if (matcher instanceof RegExp) return matcher.test(url.href);
  if (typeof matcher === 'function') {
    return matcher({ url, request: new Request(url.href), sameOrigin: url.origin === ORIGINE });
  }
  throw new TypeError(`urlPattern d'un type inattendu : ${typeof matcher}`);
}

function main() {
  const dist = resolveDistDir(HERE, process.argv);
  const source = readFileSync(`${dist}/sw.js`, 'utf8');
  const violations = auditSeauApi(source);

  if (violations.length > 0) {
    console.error('\n  Le seau `api` du service worker construit ne tient pas sa règle :\n');
    for (const violation of violations) console.error(`    • ${violation}`);
    console.error('');
    process.exit(1);
  }

  console.log(
    '  sw.js : le seau `api` décide tout seul, garde le produit hors ligne et ' +
      'laisse TOUTE réponse /api/v1/admin/** hors du disque.',
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
