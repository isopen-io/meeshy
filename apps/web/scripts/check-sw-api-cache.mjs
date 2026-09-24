#!/usr/bin/env node
/**
 * LES SEAUX DU SERVICE WORKER, MESURÉS SUR `dist/sw.js` PUIS DANS UN
 * NAVIGATEUR RÉEL (#6862, étendu #6973).
 *
 * ## CE QUE #6973 A AJOUTÉ, ET POURQUOI CE GATE NE SUFFISAIT PAS
 *
 * La règle du seau `api` était juste, autonome, bien branchée — et la v2
 * perdait quand même sa lecture hors ligne. Mesuré en rejouant le routeur de
 * Workbox sur l'artefact du 2026-09-18 :
 *
 *     SEAU api   [image] …/api/v1/attachments/file/2026%2F09%2Fu%2Favatar.png
 *     SEAU api   [video] …/api/v1/attachments/file/2026%2F09%2Fu%2Freel.mp4
 *     SEAU api   [json ] …/api/v1/conversations?limit=30
 *
 * Toute URL de média passe par `/api/v1/attachments/…` et le motif du seau
 * `api` n'était ancré sur aucune origine : un défilement de fil épuisait les
 * 200 entrées du seau et évinçait les réponses dont la lecture hors ligne
 * dépend. Le défaut n'était dans AUCUN des deux matchers pris séparément : il
 * était dans leur ORDRE. D'où la troisième fonction de ce gate — `auditRoutage`
 * ne demande plus « ce matcher décide-t-il bien ? » mais « QUEL SEAU gagne
 * cette requête ? », la seule question dont la réponse soit observable par
 * l'utilisateur.
 *
 * ## ET POURQUOI L'ARTEFACT NE SUFFIT PAS NON PLUS
 *
 * Le routage peut être juste et le seau rester VIDE : une `<img>` sans
 * `crossOrigin` rend une réponse OPAQUE, que `CacheFirst` rejette en silence
 * faute de `cacheableResponse`. Une analyse de texte ne verra jamais ça. La
 * phase NAVIGATEUR (`--navigateur`, opt-in) monte donc le `sw.js` construit,
 * sert une vraie image sous `/api/v1/attachments/file/…` depuis une SECONDE
 * origine — comme `gate.meeshy.me` face à `meeshy.me` — et lit ce que les deux
 * seaux contiennent, avec le STATUS de chaque entrée : `200` prouve que
 * `crossOrigin` a obtenu une réponse lisible, `0` prouve qu'elle serait restée
 * opaque sans lui.
 *
 * C'est le critère de fin de #6973, littéralement : après un passage sur
 * l'application, le seau des médias contient au moins une URL `/attachments/`,
 * et le seau `api` n'en contient AUCUNE.
 *
 * POURQUOI OPT-IN ET NON PAR DÉFAUT : ce gate tourne en intégration continue
 * dans un travail qui n'installe PAS de navigateur (`ci.yml`, étape « Gates
 * web-v2 » — le travail Playwright est un AUTRE travail). L'y rendre
 * obligatoire rendrait l'étape rouge sur une absence d'outil et non sur un
 * défaut de produit. Le chemin par défaut DIT donc ce qu'il n'a pas mesuré et
 * la commande qui le mesure : un gate qui se taît sur son angle mort est pire
 * qu'un gate absent.
 */

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
import { createReadStream, readFileSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { dirname, extname, join, normalize } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { resolveDistDir } from './lib/resolve-dist-dir.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));

const ORIGINE = 'https://meeshy.me';
const PASSERELLE = 'https://gate.meeshy.me';

/** La route de flux, écrite une fois — `media-url.ts` § `ATTACHMENT_STREAM_PATH`. */
const FLUX = '/api/v1/attachments/file';
/** Le montage LEGACY non versionné, qui sert encore des `fileUrl` en base. */
const FLUX_LEGACY = '/api/attachments/file';
/** LA TROISIÈME ROUTE DE MÉDIA (#7015) — les sons de fond, AUTHENTIFIÉE. */
const SONS = '/api/v1/static';

/**
 * Les URL que le seau `api` doit REFUSER, et celles qu'il doit garder.
 *
 * Les quatre entrées `attachments` sont l'apport de #6973 : le seau `api` doit
 * les refuser TOUTES, y compris la vidéo et le vocal — non pas parce qu'un
 * autre seau les prend (il ne les prend pas, voir `ROUTAGE_ATTENDU`), mais
 * parce que ses 200 entrées sont réservées au JSON.
 */
const VERDICTS_ATTENDUS = [
  { href: `${ORIGINE}/api/v1/admin/conversations`, gardable: false },
  { href: `${ORIGINE}/api/v1/admin/conversations/c1/messages?limit=30`, gardable: false },
  { href: `${PASSERELLE}/api/v1/admin/users`, gardable: false },
  { href: `${PASSERELLE}/api/v1/admin/agent/scan-logs`, gardable: false },
  { href: `${PASSERELLE}${FLUX}/2026%2F09%2Fu%2Favatar.png`, gardable: false, media: true },
  { href: `${PASSERELLE}${FLUX_LEGACY}/2026%2F09%2Fu%2Fscene.jpg`, gardable: false, media: true },
  { href: `${PASSERELLE}/api/v1/attachments/abc123/thumbnail`, gardable: false, media: true },
  { href: `${PASSERELLE}${FLUX}/2026%2F09%2Fu%2Freel.mp4`, gardable: false, media: true },
  // #7015 — les sons de fond : 7 Mo pièce, et une route AUTHENTIFIÉE dont le
  // refus devenait un `no-response` non rattrapé à chaque lecture de story.
  { href: `${PASSERELLE}${SONS}/d0bf39b7-cd47-4e70-8f1c-34b2d9b5ee4b.m4a`, gardable: false },
  { href: `${PASSERELLE}${SONS}/42af6b03-975a-4232-9123-de3301dc260c.mp3`, gardable: false },
  { href: `${ORIGINE}/api/v1/conversations`, gardable: true },
  // CONTRASTE — la garde lit un SEGMENT, jamais un préfixe de chaîne.
  { href: `${ORIGINE}/api/v1/statistiques`, gardable: true },
  { href: `${PASSERELLE}/api/v1/conversations/c1/messages`, gardable: true },
  { href: `${ORIGINE}/api/v1/users/administrateur`, gardable: true },
  { href: `${ORIGINE}/api/v1/attachmentsfoo`, gardable: true },
  { href: `${ORIGINE}/assets/app.js`, gardable: false },
];

/** Les seaux d'exécution que l'artefact doit déclarer, et leur ORDRE attendu. */
const SEAUX = ['medias', 'api'];

/**
 * LE ROUTAGE ATTENDU — (URL, `destination`) → seau gagnant, `null` pour
 * « aucun seau, réseau nu ».
 *
 * `destination` est ce que le NAVIGATEUR pose sur la requête, et aucune URL ne
 * le porte : c'est pour ça que le seau des médias matche dessus, et c'est ce
 * qui rend « audio et vidéo hors cache » vrai par construction. Les deux
 * lignes `null` sont donc une DÉCISION inscrite dans le gate, pas un trou :
 * une règle qui les avalerait stockerait des `206` qu'elle ne peut ni garder ni
 * resservir, et un `RangeRequestsPlugin` exigerait la réponse ENTIÈRE en cache
 * — donc la vidéo complète téléchargée avant sa première image.
 */
const ROUTAGE_ATTENDU = [
  { href: `${PASSERELLE}${FLUX}/2026%2F09%2Fu%2Favatar.png`, destination: 'image', seau: 'medias' },
  { href: `${PASSERELLE}${FLUX}/2026%2F09%2Fu%2Fscene.jpg`, destination: 'image', seau: 'medias' },
  { href: `${PASSERELLE}${FLUX_LEGACY}/2026%2F09%2Fu%2Fvieille.png`, destination: 'image', seau: 'medias' },
  { href: `${PASSERELLE}/api/v1/attachments/abc123/thumbnail`, destination: 'image', seau: 'medias' },
  { href: `${ORIGINE}/brand/logo.png`, destination: 'image', seau: 'medias' },
  { href: `${PASSERELLE}${FLUX}/2026%2F09%2Fu%2Freel.mp4`, destination: 'video', seau: null },
  { href: `${PASSERELLE}${FLUX}/2026%2F09%2Fu%2Fvoix.m4a`, destination: 'audio', seau: null },
  { href: `${PASSERELLE}/api/v1/conversations?limit=30`, destination: '', seau: 'api' },
  { href: `${PASSERELLE}/api/v1/conversations/c1/messages`, destination: '', seau: 'api' },
  { href: `${PASSERELLE}/api/v1/admin/users`, destination: '', seau: null },
  /* #7015 — UN SON DE FOND N'A AUCUN SEAU, et c'est une DÉCISION.
     Il voyage en `fetch` (destination VIDE, jamais `audio` : une balise ne
     peut pas porter l'en-tête que la route exige), donc le seau `medias` ne
     le voit pas ; et le seau `api` l'exclut désormais. La passerelle rend
     `Cache-Control: private, max-age=3600` — le cache HTTP du navigateur est
     le seul qui sache reconjuguer ces octets avec l'identité qui les a
     demandés. Un seau Workbox, lui, les resservirait à n'importe qui. */
  { href: `${PASSERELLE}${SONS}/d0bf39b7-cd47-4e70-8f1c-34b2d9b5ee4b.m4a`, destination: '', seau: null },
  { href: `${PASSERELLE}${SONS}/42af6b03-975a-4232-9123-de3301dc260c.mp3`, destination: 'audio', seau: null },
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

/**
 * L'appel `registerRoute` du seau dont `cacheName` vaut `nom` : sa POSITION
 * dans le fichier (l'ordre d'enregistrement, que le routeur honore), son
 * MATCHER et sa STRATÉGIE — les trois choses qu'il faut pour juger, et une
 * seule lecture pour les trois.
 */
export function appelDuSeau(source, nom) {
  const marqueur = source.indexOf(`cacheName:"${nom}"`);
  if (marqueur === -1) return null;

  const appel = source.lastIndexOf('registerRoute(', marqueur);
  if (appel === -1) return null;

  const debut = appel + 'registerRoute('.length;
  const matcher = decoupePremierArgument(source, debut);
  if (matcher === null) return null;

  let apres = debut + matcher.length;
  while (apres < source.length && /[\s,]/.test(source[apres])) apres += 1;

  return { seau: nom, position: appel, matcher, strategie: decoupePremierArgument(source, apres) ?? '' };
}

/** Le matcher du seau dont `cacheName` vaut `nom`, tel que l'artefact le porte. */
export function matcherDuSeau(source, nom) {
  return appelDuSeau(source, nom)?.matcher ?? null;
}

/**
 * Les seaux de l'artefact, DANS L'ORDRE D'ENREGISTREMENT.
 *
 * C'est la donnée qui manquait au gate de #6862 : les deux matchers pouvaient
 * être justes et le routage faux, parce que le routeur de Workbox retient la
 * PREMIÈRE route qui matche et que l'ordre ne se lit nulle part ailleurs que
 * dans l'artefact.
 */
export function seauxDansLOrdre(source) {
  return SEAUX.map((nom) => appelDuSeau(source, nom))
    .filter((appel) => appel !== null)
    .sort((a, b) => a.position - b.position);
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

  for (const { href, gardable, media } of VERDICTS_ATTENDUS) {
    let verdict;
    try {
      verdict = applique(matcher, href, media === true ? 'image' : '');
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
          : media === true
            ? `${href} tombe dans le seau \`api\`, dont il épuise les 200 entrées — ` +
              'un défilement de fil évince alors les réponses de conversations et de messages ' +
              "dont la lecture hors ligne dépend (#6973)"
            : `${href} PART SUR LE DISQUE du poste (seau \`api\`, sept jours) — #6862 l'interdit`,
      );
    }
  }

  return violations;
}

/**
 * LE SEAU DES MÉDIAS, ET SA MOITIÉ INDISSOCIABLE (#6973).
 *
 * Sortir les médias du seau du JSON ne change RIEN sans
 * `cacheableResponse: { statuses: [0, 200] }` : une `<img>` sans `crossOrigin`
 * rend une réponse OPAQUE (status 0) et `CacheFirst` la rejette EN SILENCE. Le
 * seau resterait vide, et un gate qui ne regarderait que le routage verdirait
 * sur un correctif sans effet.
 */
export function auditSeauMedias(source) {
  const violations = [];
  const appel = appelDuSeau(source, 'medias');

  if (appel === null) {
    return ['aucun seau `medias` (`cacheName:"medias"`) dans le service worker construit'];
  }

  const api = appelDuSeau(source, 'api');
  if (api !== null && appel.position > api.position) {
    violations.push(
      'le seau `medias` est enregistré APRÈS le seau `api` — il doit venir AVANT : ' +
        'le routeur de Workbox retient la PREMIÈRE route qui matche, et toute URL de média ' +
        'passe par `/api/v1/attachments/…`',
    );
  }

  const IMAGE_DE_PASSERELLE = `${PASSERELLE}${FLUX}/2026%2F09%2Fu%2Favatar.png`;
  let matcher;
  try {
    matcher = new Function(`"use strict"; return (${appel.matcher});`)();
    if (!applique(matcher, IMAGE_DE_PASSERELLE, 'image')) {
      violations.push(
        `le seau \`medias\` ne réclame pas ${IMAGE_DE_PASSERELLE} — aucune image de la ` +
          'passerelle ne serait lisible hors ligne',
      );
    }
  } catch (err) {
    violations.push(
      `matcher NON AUTONOME du seau \`medias\` : ${err.message}. ` +
        'Workbox stringifie le `urlPattern` — il ne peut dépendre d’aucun identifiant importé. ' +
        `Texte livré : ${appel.matcher}`,
    );
  }

  const cachable = /CacheableResponsePlugin\(\{statuses:\[([^\]]*)\]\}\)/.exec(appel.strategie);
  if (cachable === null) {
    violations.push(
      'le seau `medias` ne porte pas de `CacheableResponsePlugin` — une réponse opaque ' +
        '(status 0, ce que rend une `<img>` sans `crossOrigin`) y est rejetée EN SILENCE, ' +
        'et le seau reste VIDE quel que soit le routage (#6973)',
    );
  } else {
    const statuses = cachable[1].split(',').map((s) => s.trim());
    for (const attendu of ['0', '200']) {
      if (!statuses.includes(attendu)) {
        violations.push(
          `le \`CacheableResponsePlugin\` du seau \`medias\` n'accepte pas le status ${attendu} ` +
            `(obtenu : [${cachable[1]}]) — ${attendu === '0' ? 'la réponse opaque' : 'la réponse cors'} y serait rejetée`,
        );
      }
    }
  }

  return violations;
}

/**
 * LE ROUTAGE — QUEL SEAU GAGNE CETTE REQUÊTE.
 *
 * Les deux audits ci-dessus jugent chacun UN seau. Aucun ne dit où TOMBE une
 * requête : c'est l'ordre d'enregistrement qui en décide, et c'est la seule
 * chose que l'utilisateur observe. On rejoue donc `Router.findMatchingRoute` —
 * première route qui matche, gagné.
 */
export function auditRoutage(source) {
  const seaux = seauxDansLOrdre(source).map((appel) => {
    try {
      return { ...appel, evalue: new Function(`"use strict"; return (${appel.matcher});`)() };
    } catch {
      return { ...appel, evalue: null };
    }
  });

  const violations = [];

  for (const { href, destination, seau } of ROUTAGE_ATTENDU) {
    let gagnant = null;
    for (const candidat of seaux) {
      if (candidat.evalue === null) continue;
      let verdict;
      try {
        verdict = applique(candidat.evalue, href, destination);
      } catch {
        /* Un matcher non autonome est dénoncé par son propre audit ; ici il ne
           réclame rien, ce qui est déjà ce que le navigateur observerait. */
        continue;
      }
      if (verdict) {
        gagnant = candidat.seau;
        break;
      }
    }

    if (gagnant === seau) continue;

    violations.push(
      `${href} [${destination === '' ? 'json' : destination}] → ` +
        `attendu \`${seau ?? 'aucun seau'}\`, obtenu \`${gagnant ?? 'aucun seau'}\`` +
        (seau === null
          ? ' — audio et vidéo restent HORS cache par décision (#6973 point 5) : ' +
            'une `206` de lecture progressive n’est ni stockable ni resservable sans ' +
            '`RangeRequestsPlugin`, qui exigerait la réponse ENTIÈRE en cache'
          : ''),
    );
  }

  return violations;
}

function applique(matcher, href, destination = '') {
  const url = new URL(href);
  if (matcher instanceof RegExp) return matcher.test(url.href);
  if (typeof matcher === 'function') {
    return matcher({
      url,
      request: { url: url.href, method: 'GET', destination },
      sameOrigin: url.origin === ORIGINE,
    });
  }
  throw new TypeError(`urlPattern d'un type inattendu : ${typeof matcher}`);
}

/* ------------------------------------------------------------------------- *
 * LA PHASE NAVIGATEUR — le critère de fin de #6973, littéralement.
 *
 * L'analyse de l'artefact ci-dessus ne peut pas voir la moitié qui compte le
 * plus : le routage peut être juste et le seau rester VIDE, parce que
 * `CacheFirst` rejette une réponse OPAQUE en silence sans `cacheableResponse`.
 * On monte donc le `sw.js` construit, on sert une VRAIE image sous
 * `/api/v1/attachments/file/…` depuis une SECONDE origine — comme
 * `gate.meeshy.me` face à `meeshy.me` — et on lit ce que les deux seaux
 * contiennent, avec le STATUS de chaque entrée.
 *
 * OPT-IN (`--navigateur`), et ce n'est pas de la timidité : ce gate tourne en
 * intégration continue dans un travail qui n'installe PAS de navigateur
 * (`ci.yml`, étape « Gates web-v2 »). Le rendre obligatoire rendrait cette
 * étape rouge sur une absence d'outil, pas sur un défaut de produit. Le chemin
 * par défaut DIT donc ce qu'il n'a pas mesuré, et la commande qui le mesure —
 * un gate qui se taît sur son angle mort est pire qu'un gate absent.
 * ------------------------------------------------------------------------- */

const TYPES_SERVIS = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.woff2': 'font/woff2',
};

/**
 * L'ORIGINE DE L'APPLICATION. Elle sert `dist/`, et AUSSI la route de flux —
 * sans `Access-Control-Allow-Origin`, délibérément : c'est la mesure de ce que
 * `crossOrigin` coûte quand l'image est de MÊME origine (le proxy de
 * développement). Le mode `cors` n'applique aucune vérification CORS à une
 * réponse same-origin ; si cette image échouait, `mediaImageCrossOrigin`
 * casserait le développement, et le gate le dirait.
 */
function serveurOrigine(dist, png) {
  const server = createServer((req, res) => {
    const url = new URL(req.url, 'http://x');

    if (url.pathname.startsWith(FLUX)) {
      res.writeHead(200, { 'content-type': 'image/png', 'cache-control': 'no-store' });
      res.end(png);
      return;
    }

    const relatif = normalize(url.pathname).replace(/^\/+/, '');
    for (const candidat of [join(dist, relatif), join(dist, 'index.html')]) {
      try {
        if (!statSync(candidat).isFile()) continue;
      } catch {
        continue;
      }
      res.writeHead(200, {
        'content-type': TYPES_SERVIS[extname(candidat)] ?? 'application/octet-stream',
        'cache-control': 'no-cache, no-store, must-revalidate',
      });
      createReadStream(candidat).pipe(res);
      return;
    }

    res.writeHead(404).end('404');
  });
  return server;
}

/**
 * LA PASSERELLE — une SECONDE origine, comme en production. Elle rend
 * `Access-Control-Allow-Origin: *` exactement comme `crossOriginMediaHeaders`
 * (`services/gateway/src/routes/attachments/download.ts`) : c'est l'en-tête
 * dont #6973 dit qu'il est INERTE tant que l'`<img>` ne demande pas le mode
 * `cors`, et c'est ici qu'on le vérifie.
 */
function serveurPasserelle(png) {
  return createServer((req, res) => {
    const url = new URL(req.url, 'http://x');
    const cors = { 'access-control-allow-origin': '*', 'cache-control': 'no-store' };

    if (url.pathname.startsWith(FLUX) || url.pathname.startsWith(FLUX_LEGACY)) {
      res.writeHead(200, { ...cors, 'content-type': 'image/png' });
      res.end(png);
      return;
    }
    if (url.pathname.startsWith('/api/')) {
      res.writeHead(200, { ...cors, 'content-type': 'application/json' });
      res.end(JSON.stringify({ success: true, data: [] }));
      return;
    }
    res.writeHead(404).end('404');
  });
}

const ecoute = (server) =>
  new Promise((ok) => server.listen(0, '127.0.0.1', () => ok(`http://127.0.0.1:${server.address().port}`)));

async function mesureNavigateur(dist) {
  const { launchChromium } = await import('./lib/browser.mjs');
  /* Une image RÉELLE, prise dans l'artefact : un PNG codé en dur dans ce
     fichier serait une constante à croire, celle-ci est déjà servie en
     production (`globPatterns` de `vite.config.ts` la précache). */
  const png = readFileSync(`${dist}/favicon-48.png`);

  const origine = serveurOrigine(dist, png);
  const passerelle = serveurPasserelle(png);
  const baseOrigine = await ecoute(origine);
  const basePasserelle = await ecoute(passerelle);

  const browser = await launchChromium();
  const violations = [];

  try {
    const page = await browser.newPage();
    await page.goto(`${baseOrigine}/`, { waitUntil: 'load' });
    await page.waitForFunction(() => navigator.serviceWorker.controller !== null, null, { timeout: 30_000 });

    const chargements = await page.evaluate(async (gate) => {
      const charge = (src, cors) =>
        new Promise((ok) => {
          const img = new Image();
          if (cors) img.crossOrigin = 'anonymous';
          img.onload = () => ok({ src, charge: true, largeur: img.naturalWidth });
          img.onerror = () => ok({ src, charge: false, largeur: 0 });
          img.src = src;
        });

      const resultats = [
        await charge(`${gate}/api/v1/attachments/file/cors.png`, true),
        await charge(`${gate}/api/v1/attachments/file/opaque.png`, false),
        await charge('/api/v1/attachments/file/meme-origine.png', true),
      ];
      /* Le JSON, pour que le seau `api` soit PEUPLÉ : « il ne contient aucune
         URL /attachments/ » ne prouve rien sur un seau vide. */
      await fetch(`${gate}/api/v1/conversations?limit=30`).catch(() => {});
      return resultats;
    }, basePasserelle);

    for (const { src, charge, largeur } of chargements) {
      if (!charge || largeur === 0) {
        violations.push(
          `l'image ${src} n'a PAS chargé dans le navigateur (largeur ${largeur}) — ` +
            'un `crossOrigin` posé sur un hôte qui ne rend pas ' +
            '`Access-Control-Allow-Origin` fait échouer l’image en silence',
        );
      }
    }

    /* Le PUT en cache est asynchrone (`CacheFirst` répond avant de l'avoir
       terminé, via `event.waitUntil`) : on attend le seau, on ne l'échantillonne
       pas. */
    await page
      .waitForFunction(
        async () => {
          if (!(await caches.has('medias'))) return false;
          const clefs = await (await caches.open('medias')).keys();
          return clefs.filter((r) => r.url.includes('/attachments/')).length >= 3;
        },
        null,
        { timeout: 20_000 },
      )
      .catch(() => {
        /* L'assertion qui suit dira ce qui manque, avec les URL obtenues. */
      });

    const seaux = await page.evaluate(async () => {
      const lire = async (nom) => {
        if (!(await caches.has(nom))) return [];
        const cache = await caches.open(nom);
        const entrees = [];
        for (const requete of await cache.keys()) {
          const reponse = await cache.match(requete);
          entrees.push({ url: requete.url, status: reponse?.status ?? -1, type: reponse?.type ?? 'absent' });
        }
        return entrees;
      };
      return { api: await lire('api'), medias: await lire('medias') };
    });

    const medias = seaux.medias.filter((e) => e.url.includes('/attachments/'));
    const apiMedias = seaux.api.filter((e) => e.url.includes('/attachments/'));

    if (medias.length === 0) {
      violations.push(
        'le seau `medias` ne contient AUCUNE URL /attachments/ après un passage ' +
          `sur l'application (obtenu : ${seaux.medias.map((e) => e.url).join(', ') || 'seau vide'}) — ` +
          'c’est le critère de fin de #6973',
      );
    }
    if (apiMedias.length > 0) {
      violations.push(
        `le seau \`api\` contient ${apiMedias.length} URL /attachments/ ` +
          `(${apiMedias.map((e) => e.url).join(', ')}) — ses 200 entrées sont RÉSERVÉES au JSON`,
      );
    }
    if (seaux.api.length === 0) {
      violations.push(
        'le seau `api` est VIDE — un « il ne contient aucun média » ne prouve rien sur un seau vide ; ' +
          'la réponse JSON servie n’y est pas entrée',
      );
    }

    const cors = medias.find((e) => e.url.endsWith('cors.png'));
    const opaque = medias.find((e) => e.url.endsWith('opaque.png'));

    if (cors !== undefined && cors.status !== 200) {
      violations.push(
        `l'image demandée en mode \`cors\` est gardée en status ${cors.status} (type ${cors.type}) ` +
          'au lieu de 200 — `crossOrigin` n’a pas obtenu de réponse lisible',
      );
    }
    if (opaque !== undefined && opaque.status !== 0) {
      violations.push(
        `l'image demandée SANS \`crossOrigin\` est gardée en status ${opaque.status} ` +
          '— la mesure attendait 0 (opaque) : c’est elle qui justifie `statuses: [0, 200]`',
      );
    }

    console.log('\n  NAVIGATEUR — ce que les deux seaux contiennent :');
    for (const entree of seaux.medias) {
      console.log(`    medias  status ${String(entree.status).padStart(3)}  ${entree.type.padEnd(7)} ${entree.url}`);
    }
    for (const entree of seaux.api) {
      console.log(`    api     status ${String(entree.status).padStart(3)}  ${entree.type.padEnd(7)} ${entree.url}`);
    }
    await page.close();
  } finally {
    await browser.close();
    origine.close();
    passerelle.close();
  }

  return violations;
}

/* ------------------------------------------------------------------------- *
 * LE PILOTE
 * ------------------------------------------------------------------------- */

const DRAPEAU_NAVIGATEUR = '--navigateur';

async function main() {
  const argv = process.argv.filter((argument) => argument !== DRAPEAU_NAVIGATEUR);
  const dist = resolveDistDir(HERE, argv);
  const source = readFileSync(`${dist}/sw.js`, 'utf8');

  const phases = [
    ['le seau `api`', auditSeauApi(source)],
    ['le seau `medias`', auditSeauMedias(source)],
    ['le routage', auditRoutage(source)],
  ];

  if (process.argv.includes(DRAPEAU_NAVIGATEUR)) {
    phases.push(['le navigateur', await mesureNavigateur(dist)]);
  }

  const violations = phases.flatMap(([phase, liste]) => liste.map((violation) => `[${phase}] ${violation}`));

  if (violations.length > 0) {
    console.error('\n  Les seaux du service worker construit ne tiennent pas leur règle :\n');
    for (const violation of violations) console.error(`    • ${violation}`);
    console.error('');
    process.exit(1);
  }

  console.log(
    '  sw.js : le seau `api` décide tout seul, garde le JSON hors ligne, et laisse ' +
      'hors du disque TOUTE réponse /api/v1/admin/**.\n' +
      '  sw.js : le seau `medias` prend les images de la passerelle AVANT le seau `api` ' +
      '(`statuses: [0, 200]`) ; audio et vidéo restent hors cache, par décision.',
  );

  if (!process.argv.includes(DRAPEAU_NAVIGATEUR)) {
    /* CE QUE CE VERDICT NE COUVRE PAS, DIT À VOIX HAUTE. Le routage peut être
       juste et le seau rester VIDE : seule la phase navigateur voit une image
       RÉELLE y entrer. Elle est opt-in parce que le travail d'intégration
       continue qui joue ce gate n'installe pas de navigateur. */
    console.log(
      `  (non mesuré : qu'une image RÉELLE entre dans le seau. ` +
        `\`node scripts/check-sw-api-cache.mjs ${DRAPEAU_NAVIGATEUR}\` le mesure au navigateur.)`,
    );
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
