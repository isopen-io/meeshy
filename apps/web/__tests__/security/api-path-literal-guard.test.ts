/**
 * Aucun chemin d'API n'est écrit À LA MAIN dans le web, hors du catalogue (#4285, critère 2).
 *
 * ## Le trou que cette garde ferme
 *
 * `API_ENDPOINTS` (réexporté depuis `lib/config.ts` — c'était 46 entrées
 * manuscrites avant #4281, c'est désormais une PROJECTION du catalogue) et sa
 * source, le catalogue GÉNÉRÉ `packages/shared/api/endpoints.ts` (#4280, 419
 * entrées, cliqueté contre le manifeste de routes), existent — mais RIEN
 * n'empêchait, avant #4281, un développeur d'écrire
 * un chemin `/api/...` (ou un argument nu de `buildApiUrl(`) directement au
 * site d'appel, sans jamais lire le catalogue. C'est EXACTEMENT la faille qui
 * a laissé passer #4219 (trois `/health/*` inexistantes appelées depuis
 * `monitoring.service.ts` via `apiService.get('/health/ready')`, avalées par
 * un `Promise.allSettled` qui rend un échec indiscernable d'une absence de
 * données) et #4222 (`use-group-modal.ts` postait `POST /groups`, absente) —
 * deux fonctionnalités entièrement dessinées, entièrement câblées, jamais
 * capables d'aboutir. Un catalogue qu'on peut CONTOURNER n'est qu'une
 * suggestion (corps de #4285) : cette garde rend le contournement VISIBLE.
 *
 * ## Ce qui est balayé
 *
 * DEUX motifs indépendants (l'un OU l'autre suffit à qualifier un site) :
 *   (a) un littéral (chaîne ou gabarit) dont le PRÉFIXE STATIQUE commence
 *       par `/api/` — y compris quand ce préfixe n'ouvre PAS le gabarit
 *       (`` `${frontendUrl}/api/og-image-dynamic?...` `` — trouvé par ce
 *       balayage dans quatre fichiers, cf. inventaire figé, jamais visé par
 *       #4219/#4222 mais de la MÊME famille : un chemin d'API tapé à la main,
 *       jamais vérifié contre aucune table de routes) ;
 *   (b) un littéral passé en premier argument à `buildApiUrl(` OU à l'un des
 *       SEPT verbes HTTP de `apiService` (`get/post/put/patch/delete/
 *       uploadFile/getBlob`, lus dans `services/api.service.ts` — chacun
 *       délègue à `request()`, qui appelle `buildApiUrl(endpoint)` tel quel,
 *       SANS transformation). Motif nécessaire en PLUS de (a) parce que
 *       `buildApiUrl`/`apiService` acceptent aussi des chemins SANS préfixe
 *       `/api/` (`buildApiUrl('/auth/login')` — la forme majoritaire dans ce
 *       dépôt, cf. inventaire) : ce sont EXACTEMENT les deux moitiés que le
 *       critère 2 de #4285 nomme (« un littéral commençant par /api/ OU
 *       passé à buildApiUrl( »), et (b) est ce qui aurait attrapé la forme
 *       RÉELLE du bug #4219 (`apiService.get('/health/ready')` — ni préfixé
 *       `/api/`, ni un appel à `buildApiUrl` au sens syntaxique strict).
 *
 * Un gabarit (`` `/x/${id}` ``) est lu par PRÉFIXES STATIQUES successifs — le
 * texte entre deux trous `${...}` — jamais en évaluant l'expression : cette
 * garde n'exécute aucun TypeScript, elle lit du texte. Un motif (a) qualifie
 * dès qu'UN SEUL préfixe statique (pas seulement le premier) commence par
 * `/api/` — la version qui ne regardait QUE le premier segment ratait les
 * quatre sites `${frontendUrl}/api/og-image-dynamic?…`, mesuré en la codant
 * puis en la remplaçant (voir le commit de ce lot pour la trace).
 *
 * ## Ce qui est EXCLU, et pourquoi (faux positifs écartés)
 *
 * - Commentaires (`//`, `/* … *\/`) : le tokenizer bascule en mode
 *   commentaire AVANT de chercher un guillemet — un chemin cité en prose
 *   (`// await apiService.delete('/api/v1/me/account')`,
 *   `privacy-settings.tsx`) n'est jamais vu comme littéral.
 * - `lib/config.ts` — c'est le FICHIER qui DÉFINIT `API_ENDPOINTS` et
 *   `buildApiUrl`/`buildGatewayUrl`/`buildWsUrl` eux-mêmes. Un littéral écrit
 *   LÀ n'est pas « hors du catalogue » : il EST le catalogue (ou la
 *   normalisation qui le sert). Seul fichier exclu par construction — aucun
 *   autre n'a besoin de l'être (le futur `packages/shared/api/endpoints.ts`
 *   n'est même pas sous `apps/web/`, donc jamais balayé).
 * - L'idiome d'INSPECTION (`.startsWith(`, `.includes(`, `.match(`, `.test(`,
 *   `.replace(`, `.replaceAll(`) : un chemin littéral y sert à RECONNAÎTRE
 *   une valeur déjà reçue (`pathname.startsWith('/api/attachments/file/')`,
 *   `utils/attachment-url.ts`), jamais à CONSTRUIRE un appel. Compter ces
 *   sites ferait rougir la garde sur du code qui ne parle à AUCUNE route.
 * - Les routes LOCALES de Next.js (`app/api/**\/route.ts` — au 2026-08-29 :
 *   `client-error`, `health`, `metadata`, `upload/avatar`, `upload/banner`)
 *   sont un « BFF » same-origin, PAS des adresses du gateway
 *   (`next.config.ts:59`, « No rewrites for /api - Next.js uses /api for BFF
 *   routes »). `fetch('/api/upload/avatar', …)` (`user-settings.tsx`) est
 *   donc légitime — la liste des préfixes est DÉRIVÉE mécaniquement du
 *   contenu réel de `app/api/` (jamais tapée), exactement l'esprit du
 *   manifeste de routes côté gateway (#4276) appliqué à la petite surface
 *   locale du web. Un `/api/xxx` qui ne matche AUCUN de ces préfixes reste
 *   qualifié : c'est ainsi que `/api/og-image-dynamic` (`app/chat/[id]/
 *   layout.tsx` et trois jumeaux) — SANS route locale correspondante ET sans
 *   passer par `buildApiUrl`/`apiService` — est resté dans l'inventaire :
 *   candidat sérieux à un cinquième bug de la famille #4219/#4222, PAS
 *   corrigé ici (hors territoire de cette garde, qui n'écrit que des tests).
 *
 * ## L'inventaire figé — CE QU'IL EST, ET COMMENT IL DÉCROÎT
 *
 * `packages/shared/api/endpoints.ts` (#4280) existe DEPUIS AUJOURD'HUI ; le
 * web ne le consomme pas encore (migration = #4281, hors périmètre de cette
 * issue). Les 231 sites ci-dessous sont donc la photographie de l'état RÉEL
 * du dépôt à l'écriture de cette garde — pas des défauts nouveaux, l'exact
 * inverse d'un défaut caché : ils étaient INVISIBLES avant cette garde, ils
 * sont maintenant NOMMÉS, un par un, et VUS. Rien ici n'est corrigé (cette
 * session n'écrit que des gardes, jamais de code de production) : geler
 * documente que ces sites sont VUS, pas qu'ils sont bons.
 *
 * CLÉ SANS NUMÉRO DE LIGNE — loi du dépôt (`services/gateway/CLAUDE.md`,
 * appliquée ici côté web) : une clé de ligne dérive à la première édition
 * voisine et transforme le cliquet en bruit. La clé est donc FICHIER + COMPTE
 * (`Record<string, number>`), comme `unbounded-findmany-guard.test.ts` et
 * `response-schema-closure-guard.test.ts` côté gateway.
 *
 * DÉCROISSANCE : quand #4281 (ou un correctif ponctuel) fait migrer un site
 * vers `API_ENDPOINTS` du catalogue partagé, son littéral disparaît du texte
 * source — le compte du fichier BAISSE mécaniquement, le premier `it`
 * ci-dessous rougit (`toEqual` exige une égalité EXACTE, dans les DEUX sens),
 * et retirer — ou décrémenter — l'entrée correspondante ci-dessous FAIT
 * PARTIE du correctif qui l'a fait baisser. Un fichier qui atteint zéro
 * disparaît ENTIÈREMENT de l'objet (`toEqual({})` est la cible finale). Un
 * inventaire qu'on ne peut jamais faire décroître serait une dispense
 * permanente déguisée en photographie.
 *
 * ## Sa limite, dite à voix haute
 *
 * Elle lit du TEXTE. Un chemin assemblé par CONCATÉNATION (`'/api/' + seg`)
 * ou par un TROISIÈME wrapper qui relaie vers `buildApiUrl` sans être nommé
 * `apiService` (ex. le helper privé interne à `link-conversation.service.ts`)
 * échappe à cette garde SAUF si le littéral source lui-même commence par
 * `/api/` — ce qui est le cas mesuré ici (`link-conversation.service.ts:154,
 * 187` SONT dans l'inventaire, capturés par le motif (a) directement, sans
 * avoir besoin de connaître ce wrapper). C'est le même angle mort que
 * `search-tokens-write-guard.test.ts` : la garde attrape la forme ORDINAIRE,
 * celle par laquelle #4219/#4222 sont arrivés, pas une construction
 * dynamique délibérément contournante.
 */

import fs from 'fs';
import os from 'os';
import path from 'path';
import { execFileSync } from 'child_process';

const WEB_ROOT = path.resolve(__dirname, '../..');
const API_ROOT = path.join(WEB_ROOT, 'app/api');

/** Répertoires hors périmètre : fixtures, sorties de build, outillage de test — jamais du code CLIENT qui appelle le gateway. */
const IGNORED_DIRS = new Set([
  'node_modules', '.next', '.turbo', '.swc', '.git',
  '__tests__', '__mocks__', 'coverage', 'e2e', 'playwright-report', 'test-results',
]);

/** Seul fichier où un littéral d'API EST le catalogue plutôt qu'une lecture qui le contourne (voir header). */
const CATALOG_DEFINITION_FILES = new Set([path.join(WEB_ROOT, 'lib/config.ts')]);

/** Les sept verbes HTTP publics de `ApiService` (`services/api.service.ts`) — chacun délègue à `request()`, qui appelle `buildApiUrl(endpoint)` SANS transformer l'argument. Un littéral ici a exactement le même effet qu'un littéral passé à `buildApiUrl` directement. */
const API_SERVICE_VERBS = ['get', 'post', 'put', 'patch', 'delete', 'uploadFile', 'getBlob'] as const;

const WRAPPER_CALL_RE = new RegExp(`(?:buildApiUrl|apiService\\.(?:${API_SERVICE_VERBS.join('|')}))\\s*\\(\\s*$`);

/** Un littéral argument de l'un de ces appels INSPECTE une valeur déjà reçue — il ne construit aucun appel réseau. */
const INSPECT_CALL_RE = /\.(startsWith|includes|match|test|replace|replaceAll)\s*\(\s*$/;

// =============================================================================
// Tokenizer minimal : assez pour distinguer commentaire / chaîne simple /
// gabarit, JAMAIS un parseur TypeScript complet. Les trous `${...}` d'un
// gabarit sont SAUTÉS (récursivement — un trou peut contenir sa propre chaîne
// ou son propre gabarit imbriqué) sans être évalués : cette garde lit du
// texte, elle n'exécute rien.
// =============================================================================

function skipSimpleString(source: string, index: number): number {
  const quote = source[index];
  let i = index + 1;
  while (i < source.length) {
    if (source[i] === '\\') { i += 2; continue; }
    if (source[i] === quote) return i + 1;
    i++;
  }
  return i;
}

/** Fin de l'interpolation ouverte par `${` — `index` pointe juste APRÈS les deux caractères `${`. */
function skipInterpolation(source: string, index: number): number {
  let depth = 1;
  let i = index;
  while (i < source.length && depth > 0) {
    const c = source[i];
    if (c === '{') { depth++; i++; continue; }
    if (c === '}') { depth--; i++; continue; }
    if (c === "'" || c === '"') { i = skipSimpleString(source, i); continue; }
    if (c === '`') { i = skipTemplateLiteral(source, i); continue; }
    if (c === '/' && source[i + 1] === '/') { const nl = source.indexOf('\n', i); i = nl === -1 ? source.length : nl; continue; }
    if (c === '/' && source[i + 1] === '*') { const end = source.indexOf('*/', i + 2); i = end === -1 ? source.length : end + 2; continue; }
    i++;
  }
  return i;
}

function skipTemplateLiteral(source: string, index: number): number {
  let i = index + 1;
  while (i < source.length) {
    const c = source[i];
    if (c === '\\') { i += 2; continue; }
    if (c === '`') return i + 1;
    if (c === '$' && source[i + 1] === '{') { i = skipInterpolation(source, i + 2); continue; }
    i++;
  }
  return i;
}

/** Les préfixes STATIQUES successifs d'un gabarit — le texte entre deux trous `${...}`, jamais leur contenu. `index` pointe sur le backtick ouvrant. */
function readTemplateSegments(source: string, index: number): { segments: string[]; end: number } {
  let i = index + 1;
  let segment = '';
  const segments: string[] = [];
  while (i < source.length) {
    const c = source[i];
    if (c === '\\') { segment += source[i] + (source[i + 1] ?? ''); i += 2; continue; }
    if (c === '`') { i++; break; }
    if (c === '$' && source[i + 1] === '{') {
      segments.push(segment);
      segment = '';
      i = skipInterpolation(source, i + 2);
      continue;
    }
    segment += c;
    i++;
  }
  segments.push(segment);
  return { segments, end: i };
}

export type ApiLiteralSite = {
  readonly file: string;
  readonly line: number;
  /** Les trous `${...}` sont rendus par `⟨…⟩` — lisible sans évaluer quoi que ce soit. */
  readonly display: string;
};

/**
 * Les sites d'UN fichier qui portent un littéral d'API tapé à la main —
 * motif (a) ou (b) du header, idiome d'inspection excepté. `nextLocalPrefixes`
 * est injecté (jamais recalculé ici) : cette fonction reste pure et testable
 * sur du texte synthétique, sans toucher au système de fichiers.
 */
export function scanApiPathLiterals(
  source: string,
  file: string,
  nextLocalPrefixes: readonly string[]
): ApiLiteralSite[] {
  const sites: ApiLiteralSite[] = [];
  const n = source.length;
  let i = 0;

  const record = (segments: readonly string[], isTemplate: boolean, start: number, end: number): void => {
    const before = source.slice(Math.max(0, start - 80), start).trimEnd();
    const isWrapperArg = WRAPPER_CALL_RE.test(before);
    if (INSPECT_CALL_RE.test(before)) return;

    const startsWithApi = segments.some((s) => s.startsWith('/api/'));
    if (!startsWithApi && !isWrapperArg) return;

    const firstSegment = (segments[0] ?? '').split('?')[0];
    const isNextLocal = nextLocalPrefixes.some((p) => firstSegment === p || firstSegment.startsWith(`${p}/`));
    // Un chemin LOCAL passé malgré tout à buildApiUrl/apiService viserait le
    // MAUVAIS serveur (ces wrappers ciblent TOUJOURS le gateway) — l'exemption
    // locale ne joue donc que hors de ce contexte, jamais pour (b).
    if (isNextLocal && !isWrapperArg) return;

    sites.push({
      file,
      line: source.slice(0, start).split('\n').length,
      display: segments.join(isTemplate ? '⟨…⟩' : ''),
    });
  };

  while (i < n) {
    const c = source[i];
    const c2 = source[i + 1];
    if (c === '/' && c2 === '/') { const nl = source.indexOf('\n', i); i = nl === -1 ? n : nl; continue; }
    if (c === '/' && c2 === '*') { const end = source.indexOf('*/', i + 2); i = end === -1 ? n : end + 2; continue; }
    if (c === "'" || c === '"') {
      const start = i;
      const end = skipSimpleString(source, i);
      record([source.slice(start + 1, end - 1)], false, start, end);
      i = end;
      continue;
    }
    if (c === '`') {
      const start = i;
      const { segments, end } = readTemplateSegments(source, start);
      record(segments, true, start, end);
      i = end;
      continue;
    }
    i++;
  }
  return sites;
}

/**
 * Les préfixes du « BFF » local Next.js — DÉRIVÉS de `app/api/**\/route.ts`,
 * jamais tapés (même esprit que le manifeste de routes du gateway, #4276,
 * appliqué à cette petite surface locale). Un dossier de segment DYNAMIQUE
 * (`[token]`) n'apparaît dans aucune des cinq routes actuelles ; s'il en
 * apparaissait une, ce dérivateur la porterait telle quelle
 * (`/api/x/[token]`) plutôt que de deviner un joker — aucun site de ce dépôt
 * n'en a besoin aujourd'hui, donc aucun n'est écrit ici sans preuve.
 */
export function nextLocalApiPrefixes(apiRoot: string): string[] {
  if (!fs.existsSync(apiRoot)) return [];
  const prefixes: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) { walk(full); continue; }
      if (entry.name === 'route.ts' || entry.name === 'route.tsx') {
        const rel = path.relative(apiRoot, dir).split(path.sep).filter(Boolean).join('/');
        prefixes.push(rel ? `/api/${rel}` : '/api');
      }
    }
  };
  walk(apiRoot);
  return prefixes.sort();
}

function isSourceFile(name: string): boolean {
  return /\.(ts|tsx)$/.test(name) && !/\.(test|spec|stories|d)\.(ts|tsx)$/.test(name);
}

/**
 * Ce que git IGNORE ne fait pas partie du dépôt, donc ne peut pas faire rougir
 * une garde de dépôt.
 *
 * Le balayage lisait le DISQUE. Il tombait donc sur des fichiers présents
 * localement et invisibles à la CI — `apps/web/components/debug/` est ignoré
 * par `.gitignore:313`, et son panneau de mise au point appelle
 * `buildApiUrl('/notifications')`. La garde était rouge chez quiconque a ce
 * dossier et verte partout ailleurs : la pire divergence pour une garde,
 * parce qu'AUCUN commit ne peut la refermer. Une garde qu'on ne peut pas
 * rendre verte est une garde qu'on finit par désactiver — et le dépôt a déjà
 * 464 témoins passés au vert en perdant leur protection.
 *
 * `git ls-files` est la seule réponse autoritative à « que contient le
 * dépôt ? ». Le repli sur le balayage disque couvre le cas où git est
 * indisponible : mieux vaut une garde trop large qu'aucune garde.
 */
function trackedSourceFiles(root: string): string[] | null {
  try {
    const sortie = execFileSync('git', ['ls-files', '-z', '--', '*.ts', '*.tsx'], {
      cwd: root,
      encoding: 'utf8',
      maxBuffer: 32 * 1024 * 1024,
    });
    const relatifs = sortie.split('\0').filter(Boolean);
    if (relatifs.length === 0) return null;
    return relatifs
      .filter((rel) => {
        const segments = rel.split('/');
        if (segments.some((seg) => IGNORED_DIRS.has(seg))) return false;
        return isSourceFile(segments[segments.length - 1] ?? '');
      })
      .map((rel) => path.join(root, rel));
  } catch {
    return null;
  }
}

function walkSourceFiles(dir: string, acc: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!IGNORED_DIRS.has(entry.name)) walkSourceFiles(path.join(dir, entry.name), acc);
      continue;
    }
    if (isSourceFile(entry.name)) acc.push(path.join(dir, entry.name));
  }
  return acc;
}

/** Les fichiers du DÉPÔT sous `apps/web/`, jamais ceux du seul disque. */
function sourceFilesUnderWeb(webRoot: string): string[] {
  return trackedSourceFiles(webRoot) ?? walkSourceFiles(webRoot);
}

/** Le balayage complet : chaque fichier source de `apps/web/`, catalogue exclu. */
export function sweepApiPathLiterals(webRoot: string): ApiLiteralSite[] {
  const prefixes = nextLocalApiPrefixes(path.join(webRoot, 'app/api'));
  const sites: ApiLiteralSite[] = [];
  for (const file of sourceFilesUnderWeb(webRoot)) {
    if (CATALOG_DEFINITION_FILES.has(file)) continue;
    const source = fs.readFileSync(file, 'utf8');
    sites.push(...scanApiPathLiterals(source, path.relative(webRoot, file), prefixes));
  }
  return sites;
}

/** Compte les sites par FICHIER — la clé stable (voir header, « inventaire figé »). */
function countByFile(sites: ReadonlyArray<ApiLiteralSite>): Record<string, number> {
  return sites.reduce<Record<string, number>>((acc, s) => ({ ...acc, [s.file]: (acc[s.file] ?? 0) + 1 }), {});
}

// =============================================================================
// Inventaire GELÉ — photographie du 2026-08-29 (231 sites, 74 fichiers), migrée
// par #4281 (2026-08-30) vers 14 sites, 10 fichiers, puis par #4337
// (2026-08-30) vers 10 sites, 8 fichiers, puis par #4338 (2026-08-30, volet
// rafraîchissement de session) vers 9 sites, 7 fichiers. Voir header, « Ce
// qu'il est, et comment il décroît » : décroître un compte ci-dessous FAIT
// PARTIE du correctif qui migre le site vers `API_ENDPOINTS` (#4281, #4337,
// #4338) ou vers une route existante. Les sept entrées restantes se
// répartissent en deux familles — aucune n'est un défaut de #4281 :
//
//   (a) SKIP délibéré, sur instruction de l'issue #4281 elle-même — une
//       adresse morte encore instruite sous sa propre issue (#4338, les
//       quatre sites d'image sociale) : migrer ces sites ici les aurait
//       enterrés dans un lot de migration plutôt que dans le correctif de bug
//       qui leur est dû. Comptes INCHANGÉS depuis le 2026-08-29 :
//       'app/chat/[id]/layout.tsx', 'app/signup/affiliate/[token]/layout.tsx'
//       (og-image-dynamic, #4338).
//
//   (b) DÉCOUVERTES pendant la migration — une adresse fantôme (aucune route
//       correspondante dans les 419 du catalogue #4280) qu'un chemin littéral
//       migrable côtoyait dans le même fichier. Chaque site est commenté SUR
//       PLACE dans le fichier source ('ADRESSE FANTÔME, trouvée par #4281…')
//       et compte encore ici, exactement comme (a) : ce n'est pas à une
//       migration de chemins de deviner le correctif d'une route absente.
//       'app/conversation/[conversationId]/page.tsx' et 'app/u/[id]/layout.tsx'
//       gardent chacun LEUR site og-image-dynamic (famille (a), #4338) — le
//       second site de chaque fichier, lui, a bien migré vers le catalogue.
//       'app/api/metadata/route.ts' (3→2) : `/links/:id/info`, appelée deux
//       fois, n'a pas de route `.../info` dans le catalogue — seule
//       `/links/:id` existe et sert déjà cette charge.
//       'lib/server-cache.ts' (4→1) : `getUserNotifications`, zéro appelant,
//       vise `/users/:id/notifications`, absente du manifeste — même famille
//       que les trois fonctions retirées de ce fichier par #4189.
//       'services/message-translation.service.ts' (1→2, en HAUSSE) : deux
//       adresses `/messages/:id/translate/:lang(/status)` étaient déjà
//       fantômes AVANT #4281, mais invisibles au balayage (littéral niché dans
//       un `${…}` d'un gabarit englobant — angle mort distinct de celui déjà
//       documenté en tête de fichier, à signaler à #4285). Migrer le PRÉFIXE
//       `/messages/:id` vers le catalogue les a rendues visibles : c'est un
//       GAIN de visibilité, pas une régression — deux sites nommés et
//       commentés valent mieux qu'un hors de portée du balayage.
//
//   #4337 (2026-08-30) — SORTIS de l'inventaire, pas une famille en soi : les
//       quatre appels de souscription push ont migré vers
//       `API_ENDPOINTS.users.registerDeviceToken` (POST pour enregistrer,
//       DELETE pour désenregistrer — la SEULE route de jetons push du
//       manifeste ; aucune route dédiée à une souscription Web-Push brute
//       n'existe côté gateway, les deux paires visaient donc la MÊME
//       ressource). 'hooks/use-push-notifications.ts' (2→0) et
//       'services/push-token.service.ts' (2→0) ont donc quitté l'objet — voir
//       header, « Un fichier qui atteint zéro disparaît ENTIÈREMENT ».
//
//   #4338 (2026-08-30, volet rafraîchissement de session) — SORTI de
//       l'inventaire : 'stores/auth-store.ts' (1→0) postait
//       fetch('/api/auth/refresh', …) À LA MAIN — un chemin RELATIF sans
//       `/v1`, qui frappait le serveur Next (aucune route `app/api/auth/…`
//       n'existe) plutôt que le gateway, avec un corps (`{ refreshToken }`)
//       qui ne correspondait à AUCUN champ du schéma serveur (`AuthSchemas
//       .refreshToken` n'accepte que `token`, REQUIS, et `sessionToken`,
//       optionnel). Le store appelle désormais `authService.refreshToken()`
//       (`services/auth.service.ts`), déjà câblé sur
//       `buildApiUrl(API_ENDPOINTS.auth.refresh)` — une SEULE source de
//       vérité pour l'adresse, au lieu d'un second `fetch` dupliqué. Le volet
//       `og-image-dynamic` de #4338 (les quatre sites ci-dessus, famille (a))
//       reste ouvert : arbitrage produit en attente, hors périmètre de ce
//       correctif.
// =============================================================================
const FROZEN_API_PATH_LITERALS: Readonly<Record<string, number>> = {
  // `/api/v1/og-image-dynamic` — SORTI de l'inventaire le 2026-08-30 (#4338),
  // et la façon dont il en est sorti vaut d'être dite.
  //
  // Ces quatre sites comptaient ici parce que l'adresse était MORTE (aucune
  // route locale, `404` mesuré sur staging — famille de #4219/#4222). #4338 a
  // livré la route, et l'assertion des routes locales, plus haut, a rougi le
  // jour même : le signal a fonctionné.
  //
  // Ils ne sont pas sortis pour autant : l'exemption locale teste le PREMIER
  // segment du gabarit, et `` `${frontendUrl}/api/v1/og-image-dynamic?…` ``
  // n'y met pas le chemin en premier. Ce n'était pas un défaut de ces sites —
  // une balise `og:image` DOIT porter une URL ABSOLUE — et élargir l'exemption
  // à tous les segments aurait exempté du même coup un `` `${baseURL}/api/…` ``
  // visant le GATEWAY, la classe exacte que cette garde existe pour attraper.
  // Une garde de sécurité ne s'élargit pas pour faire décroître un compteur.
  //
  // #4422 a tranché : l'exemption N'EST PAS élargie, et le comptage d'un
  // chemin local atteint par URL absolue est CONSERVÉ — deux témoins
  // synthétiques le figent dans les deux sens. Le comptage n'était pas un
  // angle mort à combler : c'est la contrainte qui a produit le bon
  // correctif, celui décrit juste en dessous.
  //
  // Ce qui les a fait sortir est le geste que la garde VISE depuis le début :
  // le chemin est écrit UNE fois (`OG_IMAGE_PATH` / `ogImageUrl`, dans
  // `lib/og-image-params.ts`), et les quatre pages l'appellent. Le littéral
  // restant est nu — donc son premier segment EST le chemin, donc l'exemption
  // joue. Quatre entrées de moins, aucune de plus.
  'app/api/metadata/route.ts': 2,
  'lib/server-cache.ts': 1,
  'services/message-translation.service.ts': 2,
};

describe('Le balayage LIT bien apps/web — sinon les gardes ci-dessous seraient vertes à vide', () => {
  it("trouve plus d'un millier de fichiers source", () => {
    expect(walkSourceFiles(WEB_ROOT).length).toBeGreaterThan(1000);
  });

  it('dérive les six routes locales Next.js connues au 2026-08-30, ni plus ni moins', () => {
    // Une SEPTIÈME route locale ajoutée demain fait rougir CETTE assertion —
    // c'est le signal voulu : une nouvelle surface « BFF » mérite d'être vue,
    // jamais absorbée en silence dans les exemptions de la garde principale.
    //
    // La sixième est arrivée le 2026-08-30 et le signal a fonctionné comme
    // annoncé : `/api/og-image-dynamic` (#4338) est la route que quatre pages
    // ANNONÇAIENT dans leur `og:image` sans que rien ne la serve — mesuré
    // `404` sur staging. L'assertion a rougi le jour où elle a été créée,
    // c'est-à-dire au moment exact où l'arbitrage devait être vu.
    expect(nextLocalApiPrefixes(API_ROOT)).toEqual([
      '/api/client-error',
      '/api/health',
      '/api/metadata',
      '/api/upload/avatar',
      '/api/upload/banner',
      '/api/v1/og-image-dynamic',
    ]);
  });
});

describe('Aucun littéral d\'API hors inventaire figé (#4285 critère 2)', () => {
  it("n'introduit aucun site neuf sous apps/web/", () => {
    expect(countByFile(sweepApiPathLiterals(WEB_ROOT))).toEqual(FROZEN_API_PATH_LITERALS);
  });

  it('lib/config.ts — le catalogue lui-même — ne contribue AUCUN site (exclusion par construction, pas par absence de contenu)', () => {
    const source = fs.readFileSync(path.join(WEB_ROOT, 'lib/config.ts'), 'utf8');
    const prefixes = nextLocalApiPrefixes(API_ROOT);
    // La preuve que l'exclusion travaille vraiment : le fichier CONTIENT bel
    // et bien AU MOINS un littéral `/api/...` (le gabarit `API_PATH`, la
    // normalisation de version que buildApiUrl consomme) — un balayage qui ne
    // le verrait pas parce qu'il ne cherche rien ne prouverait rien du tout.
    // Ce nombre est descendu à 1 avec #4281 : les 46 entrées manuscrites
    // d'API_ENDPOINTS ont quitté ce fichier pour devenir une RÉEXPORTATION du
    // catalogue partagé (@meeshy/shared/api/endpoints) — la baisse est le
    // signe que la migration a fonctionné, pas un défaut de ce test.
    expect(scanApiPathLiterals(source, 'lib/config.ts', prefixes).length).toBeGreaterThan(0);
    expect(sweepApiPathLiterals(WEB_ROOT).some((s) => s.file === 'lib/config.ts')).toBe(false);
  });
});

describe('Ce que le balayage sait discriminer', () => {
  const NO_LOCAL_PREFIXES: readonly string[] = [];
  const LOCAL_PREFIXES = ['/api/health', '/api/upload/avatar'];

  it('signale un littéral simple commençant par /api/', () => {
    const source = `await fetch('/api/v1/foo', { method: 'GET' });`;
    expect(scanApiPathLiterals(source, 'x.ts', NO_LOCAL_PREFIXES)).toMatchObject([{ file: 'x.ts' }]);
  });

  it('signale un gabarit dont le PREMIER préfixe statique commence par /api/, interpolation comprise', () => {
    const source = 'apiService.get(`/api/attachments/${id}/analysis`);';
    expect(scanApiPathLiterals(source, 'x.ts', NO_LOCAL_PREFIXES)).toHaveLength(1);
  });

  it("signale un gabarit dont SEUL le préfixe APRÈS un trou commence par /api/ (motif og-image-dynamic, cycle qui a corrigé cette garde)", () => {
    const source = 'const url = `${frontendUrl}/api/og-image-dynamic?${params}`;';
    expect(scanApiPathLiterals(source, 'x.ts', NO_LOCAL_PREFIXES)).toHaveLength(1);
  });

  it('signale un littéral SANS préfixe /api/ passé à buildApiUrl( — la forme exacte du bug #4219', () => {
    const source = `await fetch(buildApiUrl('/health/ready'));`;
    expect(scanApiPathLiterals(source, 'x.ts', NO_LOCAL_PREFIXES)).toHaveLength(1);
  });

  it.each(API_SERVICE_VERBS)(
    'signale un littéral non préfixé passé à apiService.%s(',
    (verb: (typeof API_SERVICE_VERBS)[number]) => {
    const source = `await apiService.${verb}('/groups');`;
    expect(scanApiPathLiterals(source, 'x.ts', NO_LOCAL_PREFIXES)).toHaveLength(1);
  });

  it('ignore un littéral commenté — un chemin cité en prose n\'est pas un appel', () => {
    const source = `// await apiService.delete('/api/v1/me/account');`;
    expect(scanApiPathLiterals(source, 'x.ts', NO_LOCAL_PREFIXES)).toEqual([]);
  });

  it('ignore un littéral dans un commentaire de bloc', () => {
    const source = `/* buildApiUrl('/api/v1/groups') est l'ancienne forme */`;
    expect(scanApiPathLiterals(source, 'x.ts', NO_LOCAL_PREFIXES)).toEqual([]);
  });

  it("ignore un littéral qui INSPECTE une valeur reçue plutôt que de construire un appel", () => {
    const source = `if (pathname.startsWith('/api/attachments/file/')) { return pathname; }`;
    expect(scanApiPathLiterals(source, 'x.ts', NO_LOCAL_PREFIXES)).toEqual([]);
  });

  it('ignore un littéral qui matche une route LOCALE Next.js (BFF same-origin, pas le gateway)', () => {
    const source = `await fetch('/api/upload/avatar', { method: 'POST', body: form });`;
    expect(scanApiPathLiterals(source, 'x.ts', LOCAL_PREFIXES)).toEqual([]);
  });

  /**
   * #4422 — un chemin local atteint par URL ABSOLUE reste COMPTÉ, et c'est la
   * décision.
   *
   * L'exemption locale teste le PREMIER segment du gabarit. Dans
   * `` `${frontendUrl}/api/health` ``, le premier segment est la chaîne VIDE :
   * l'exemption ne joue pas, et le site compte alors qu'il vise une route
   * locale parfaitement servie.
   *
   * ## Pourquoi on ne l'élargit PAS
   *
   * Tester tous les segments exempterait du même coup un
   * `` `${baseURL}/api/…` `` visant le GATEWAY — la classe exacte que cette
   * garde existe pour attraper (#4219, #4222, #4337). La seule information qui
   * distingue les deux est le NOM de la variable interpolée, et faire dépendre
   * une exemption de sécurité d'un nom de variable, c'est reconduire le motif
   * que ce dépôt ne cesse de trouver : un signal crédible que rien n'applique.
   * Renommer `frontendUrl` en `origin` désarmerait la garde sans qu'aucun
   * témoin ne tombe.
   *
   * ## Ce que le comptage FAIT à la place
   *
   * Il pousse vers le geste que la garde vise depuis le début : **écrire le
   * chemin une seule fois**. C'est ce qui a sorti les quatre sites
   * `og-image-dynamic` de l'inventaire — `OG_IMAGE_PATH` / `ogImageUrl` dans
   * `lib/og-image-params.ts`, et les quatre pages l'appellent. Le littéral
   * restant est nu, donc son premier segment EST le chemin, donc l'exemption
   * joue.
   *
   * Le comptage n'est donc pas un angle mort à combler : c'est la contrainte
   * qui a produit le bon correctif. Les deux témoins ci-dessous le figent dans
   * les DEUX sens, faute de quoi un lot suivant élargirait l'exemption « pour
   * faire décroître un compteur ».
   */
  it("COMPTE un chemin local atteint par URL absolue — l'exemption ne joue que sur le premier segment", () => {
    const source = 'const u = `${frontendUrl}/api/health?x=1`;';
    expect(scanApiPathLiterals(source, 'x.ts', LOCAL_PREFIXES)).toHaveLength(1);
  });

  it('COMPTE aussi le même gabarit visant le GATEWAY — les deux sont indistinguables sans lire le nom de la variable', () => {
    // Le sens qui interdit l'élargissement : si le premier témoin devenait
    // vert par une exemption élargie, celui-ci le deviendrait AUSSI — et c'est
    // exactement le site qu'on ne veut jamais laisser passer.
    const source = 'const u = `${baseURL}/api/v1/conversations`;';
    expect(scanApiPathLiterals(source, 'x.ts', LOCAL_PREFIXES)).toHaveLength(1);
  });

  it("NE PARDONNE PAS un chemin local passé à buildApiUrl — ce wrapper vise TOUJOURS le gateway", () => {
    // Un `/api/health` passé ICI viserait le mauvais serveur : l'exemption
    // locale ne joue jamais pour le motif (b), même si le préfixe matche par
    // ailleurs une route Next.js — voir `record()`, le commentaire sur `isNextLocal`.
    const source = `await apiService.get('/api/health');`;
    expect(scanApiPathLiterals(source, 'x.ts', LOCAL_PREFIXES)).toHaveLength(1);
  });

  it('ignore un littéral non préfixé et hors wrapper — hors du périmètre du critère 2 (ex. un chemin de PAGE Next.js)', () => {
    const source = `router.push('/settings');`;
    expect(scanApiPathLiterals(source, 'x.ts', NO_LOCAL_PREFIXES)).toEqual([]);
  });

  it("garde-fou du harnais : le balayage synthétique lui-même trouve les deux formes historiques réunies (#4219 + #4222), sans confondre l'une avec l'autre", () => {
    const source = [
      `await apiService.get('/health/ready');`, // #4219 : non préfixé, via apiService
      `await fetch(buildApiUrl('/api/v1/groups'), { method: 'POST' });`, // #4222 : préfixé, via buildApiUrl
    ].join('\n');
    expect(scanApiPathLiterals(source, 'x.ts', NO_LOCAL_PREFIXES)).toHaveLength(2);
  });
});

describe('sweepApiPathLiterals — le balayage COMPLET (marche + scan) sur un arbre réel', () => {
  // Preuve de bout en bout, distincte des tests ci-dessus qui n'appellent que
  // `scanApiPathLiterals` sur une chaîne : ici, `sweepApiPathLiterals` marche
  // VRAIMENT un répertoire sur disque (dérivation des préfixes locaux
  // comprise) — la classe même de défaut que #4285 vise (« rien n'empêche un
  // développeur d'écrire un chemin à la main ») ne serait pas fermée par un
  // simple détecteur de motif : il faut aussi qu'il soit VRAIMENT appelé sur
  // chaque fichier. L'arbre vit sous `os.tmpdir()` — jamais sous ce dépôt,
  // donc aucune mutation, même transitoire, hors territoire.
  it("détecte une violation neuve dans un service, ignore la route locale et l'idiome d'inspection voisins", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'api-path-literal-guard-'));
    try {
      fs.mkdirSync(path.join(root, 'app/api/allowed'), { recursive: true });
      fs.writeFileSync(path.join(root, 'app/api/allowed/route.ts'), 'export async function GET() { return new Response(); }\n');

      fs.mkdirSync(path.join(root, 'services'), { recursive: true });
      // La violation neuve : un chemin totalement inventé, jamais vu par
      // aucun cliquet de catalogue, passé À LA MAIN à apiService.get(.
      fs.writeFileSync(
        path.join(root, 'services/bad.service.ts'),
        `import { apiService } from './api.service';\nexport const doThing = () => apiService.get('/totally-invented-path');\n`
      );
      // Un appel LÉGITIME vers la route locale dérivée ci-dessus — ne doit PAS remonter.
      fs.writeFileSync(
        path.join(root, 'services/legit.service.ts'),
        `export const fetchAllowed = () => fetch('/api/allowed/thing');\n`
      );
      // Une INSPECTION, pas un appel — ne doit PAS remonter.
      fs.writeFileSync(
        path.join(root, 'services/inspect.service.ts'),
        `export const isApi = (p: string) => p.startsWith('/api/should-not-count');\n`
      );

      const sites = sweepApiPathLiterals(root);
      expect(sites.map((s) => s.file)).toEqual(['services/bad.service.ts']);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
