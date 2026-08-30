/**
 * Balayage : toute adresse qui ANNONCE son sursis est-elle COMPTÉE ?
 *
 * ## Le sens de la flèche, et pourquoi il décide de ce que le témoin mesure
 *
 * Deux balayages du dépôt partent déjà de `ROUTES_SURVEILLEES` et valident ses
 * entrées : `surveilleesMalDeclarees()` (#4470) juge la FORME de chaque entrée,
 * `deprecation-successor-sweep.ts` (#4423) juge la SUIVABILITÉ de chaque
 * successeur annoncé. Tous deux répondent « ces entrées sont justes ». Aucun
 * ne répond « ce sont TOUTES les entrées », et c'est l'affirmation coûteuse :
 * trente-sept adresses posaient `depreciee(...)` sans figurer dans la liste,
 * donc sans seau, donc sans zéro possible, donc sans retrait possible (#4488).
 *
 * Ce module part donc du CODE. Il énumère les sites qui posent
 * `depreciee(...)` / `annoncerDepreciation(...)`, résout l'adresse MONTÉE que
 * chacun annonce, et rend la liste de celles qu'aucun compteur ne voit. C'est
 * la réciproque, et elle seule mesure la COUVERTURE.
 *
 * ## Ce que « résoudre » veut dire ici, et les trois pièges qu'il évite
 *
 * L'adresse servie est `mountPrefix + chemin déclaré`, confrontée au manifeste
 * (`route-manifest.json`, produit depuis le serveur ASSEMBLÉ — jamais par
 * lecture de source). Trois pièges, mesurés sur ce dépôt :
 *
 * 1. **Le rattachement par SUFFIXE ment.** `/mentions/me` finit par `/me` :
 *    seule la composition EXACTE est employée ici.
 * 2. **La composition seule ne sait pas QUI a déclaré.** `POST '/friend-requests'`
 *    compose aussi bien sous `/api/v1` que sous `/api/v1/directory` — or la
 *    seconde adresse est le SUCCESSEUR annoncé, servie par un autre fichier
 *    qui, lui, n'annonce rien. La compter comme dépréciée ferait surveiller
 *    une adresse CIBLE, dont le compteur ne tombe jamais à zéro : le faux zéro
 *    inversé que `ROUTES_SURVEILLEES` documente déjà pour
 *    `GET /api/v1/me/preferences`. D'où {@link candidatsDuSite} : le module du
 *    manifeste d'abord (précis), les préfixes du FICHIER ensuite (complets).
 * 3. **Un chemin déclaré `'/'` ne se compose pas.** `mountPrefix + '/'` rend
 *    `/api/v1/admin/reports/`, que Fastify ne monte pas — il monte
 *    `/api/v1/admin/reports`, c'est-à-dire le préfixe NU. C'est le cas de
 *    `POST /` d'`admin/reports.ts`, nommé par #4488 : traité par une règle
 *    (`cheminDeclare === '/' ⇒ path === mountPrefix`), jamais par une
 *    exception écrite à la main.
 *
 * ## La portée d'une annonce n'est pas toujours une route
 *
 * `fastify.addHook('onRequest', depreciee(...))` déprécie TOUT le sous-arbre
 * de son encapsulation — c'est ainsi que les cinq alias racine de
 * `voice-analysis.ts` et la lecture d'octets non versionnée d'`attachments/`
 * s'annoncent. Rattacher un tel site à « la déclaration de route la plus
 * proche en amont » est un CONTRESENS qui a déjà produit une mesure fausse :
 * il fait passer `GET /api/v1/voice/analysis` — la jumelle VERSIONNÉE, qui est
 * la cible — pour une adresse dépréciée, alors que seul le montage racine
 * porte le hook. Un site de portée `plugin` se résout donc par le MODULE du
 * manifeste, jamais par un voisinage textuel.
 *
 * ## Ce qui ne se compose pas se DÉCLARE
 *
 * Trois formes échappent par construction à toute composition : un plugin de
 * FABRIQUE (le module est anonyme dans le manifeste), un chemin déclaré en
 * GABARIT (`` `${basePath}/…` ``), et une annonce posée par un HELPER que la
 * déclaration référence sans la contenir. Les laisser tomber en silence ferait
 * mesurer à ce balayage moins que ce qu'il prétend. Elles sont donc DÉCLARÉES,
 * avec leur raison et les adresses qu'elles couvrent
 * ({@link DECLARATIONS_HORS_COMPOSITION}), et la déclaration est VÉRIFIÉE des
 * deux côtés : ses adresses doivent être montées, et son site doit exister.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

/** La racine analysée : tout `src/`, et non le seul `routes/` — voir {@link FICHIERS_EXCLUS}. */
export const RACINE_SRC = join(__dirname, '..', '..');

const CHEMIN_MANIFESTE = join(__dirname, '..', '..', '..', 'route-manifest.json');

const REPERTOIRES_IGNORES = new Set(['__tests__', 'node_modules', 'dist']);

/**
 * `utils/deprecation.ts` DÉFINIT `annoncerDepreciation` — le motif y trouve la
 * déclaration, pas un site d'appel. Aucun autre fichier n'est exclu : restreindre
 * le balayage à `routes/` aurait manqué `socketio/socketio-admin-routes.ts`,
 * qui pose l'annonce des deux alias non versionnés de Socket.IO.
 */
const FICHIERS_EXCLUS = new Set([join('utils', 'deprecation.ts')]);

// ── Le manifeste, tel que ce balayage le lit ─────────────────────────────────
export type RouteMontee = {
  readonly method: string;
  readonly path: string;
  readonly mountPrefix: string;
  readonly module: string;
};

type Manifeste = {
  readonly routes: readonly RouteMontee[];
  readonly parModule: ReadonlyMap<string, readonly RouteMontee[]>;
  readonly parPrefixe: ReadonlyMap<string, readonly RouteMontee[]>;
  readonly montees: ReadonlySet<string>;
  readonly prefixes: readonly string[];
};

function estRouteMontee(valeur: unknown): valeur is RouteMontee {
  if (typeof valeur !== 'object' || valeur === null) return false;
  const brut = valeur as Record<string, unknown>;
  return (
    typeof brut.method === 'string' &&
    typeof brut.path === 'string' &&
    typeof brut.mountPrefix === 'string' &&
    typeof brut.module === 'string'
  );
}

/** Le manifeste est du JSON : il entre par `unknown` et se VALIDE, jamais par une assertion. */
export function lireManifeste(chemin: string = CHEMIN_MANIFESTE): Manifeste {
  const brut: unknown = JSON.parse(readFileSync(chemin, 'utf8'));
  const routesBrutes = (brut as { routes?: unknown }).routes;
  if (!Array.isArray(routesBrutes)) {
    throw new Error(`[balayage] ${chemin} ne porte pas de tableau "routes"`);
  }
  const routes = routesBrutes.filter(estRouteMontee);
  if (routes.length !== routesBrutes.length) {
    throw new Error(`[balayage] ${routesBrutes.length - routes.length} entrées du manifeste sont malformées`);
  }

  const parModule = new Map<string, RouteMontee[]>();
  const parPrefixe = new Map<string, RouteMontee[]>();
  const montees = new Set<string>();
  const ranger = (index: Map<string, RouteMontee[]>, cle: string, route: RouteMontee): void => {
    const deja = index.get(cle);
    if (deja === undefined) index.set(cle, [route]);
    else deja.push(route);
  };
  for (const route of routes) {
    ranger(parModule, route.module, route);
    ranger(parPrefixe, route.mountPrefix, route);
    montees.add(`${route.method} ${route.path}`);
  }
  return { routes, parModule, parPrefixe, montees, prefixes: Array.from(parPrefixe.keys()) };
}

// ── Lecture consciente des chaînes et des commentaires ───────────────────────
type Mode = null | "'" | '"' | '`' | '//' | '/*';

/**
 * Remplace commentaires et contenu des chaînes par des espaces, DÉLIMITEURS
 * compris, sans changer la longueur — pour décider si une occurrence est du
 * CODE. Ce fichier écrit son propre masque plutôt que d'en importer un d'un
 * balayage voisin : le partager rendrait les deux témoins solidaires du même
 * défaut d'analyse, ce qui est précisément ce que deux témoins doivent éviter.
 */
function masquerPourLocaliser(source: string): string {
  const sortie = source.split('');
  const n = source.length;
  const effacer = (p: number): void => {
    if (p < n && source[p] !== '\n') sortie[p] = ' ';
  };
  let i = 0;
  while (i < n) {
    if (source[i] === '/' && source[i + 1] === '/') {
      while (i < n && source[i] !== '\n') { effacer(i); i += 1; }
      continue;
    }
    if (source[i] === '/' && source[i + 1] === '*') {
      while (i < n && !(source[i] === '*' && source[i + 1] === '/')) { effacer(i); i += 1; }
      effacer(i); effacer(i + 1); i += 2;
      continue;
    }
    if (source[i] === "'" || source[i] === '"' || source[i] === '`') {
      const q = source[i];
      effacer(i); i += 1;
      while (i < n) {
        if (source[i] === '\\') { effacer(i); effacer(i + 1); i += 2; continue; }
        if (source[i] === q) { effacer(i); i += 1; break; }
        effacer(i); i += 1;
      }
      continue;
    }
    i += 1;
  }
  return sortie.join('');
}

/** Avance depuis un ouvrant jusqu'à l'index qui SUIT son fermant, chaînes et commentaires ignorés. */
function finDuBloc(source: string, debut: number): number {
  let profondeur = 0;
  let i = debut;
  let mode: Mode = null;
  while (i < source.length) {
    const c = source[i];
    const suivant = source[i + 1];
    if (mode !== null) {
      if (mode === "'" || mode === '"' || mode === '`') {
        if (c === '\\') { i += 2; continue; }
        if (c === mode) mode = null;
      } else if (mode === '//') {
        if (c === '\n') mode = null;
      } else if (c === '*' && suivant === '/') {
        mode = null; i += 2; continue;
      }
      i += 1; continue;
    }
    if (c === '/' && suivant === '/') { mode = '//'; i += 2; continue; }
    if (c === '/' && suivant === '*') { mode = '/*'; i += 2; continue; }
    if (c === "'" || c === '"' || c === '`') { mode = c; i += 1; continue; }
    if (c === '(' || c === '{' || c === '[') { profondeur += 1; i += 1; continue; }
    if (c === ')' || c === '}' || c === ']') {
      profondeur -= 1; i += 1;
      if (profondeur === 0) return i;
      continue;
    }
    i += 1;
  }
  return i;
}

function ligneDe(source: string, index: number): number {
  return source.slice(0, index).split('\n').length;
}

export function fichiersAnalyses(racine: string = RACINE_SRC, acc: string[] = []): string[] {
  for (const entree of readdirSync(racine)) {
    const chemin = join(racine, entree);
    if (statSync(chemin).isDirectory()) {
      if (!REPERTOIRES_IGNORES.has(entree)) fichiersAnalyses(chemin, acc);
      continue;
    }
    if (!entree.endsWith('.ts') || entree.endsWith('.test.ts') || entree.endsWith('.d.ts')) continue;
    if (FICHIERS_EXCLUS.has(relative(RACINE_SRC, chemin))) continue;
    acc.push(chemin);
  }
  return acc;
}

// ── Repérage des déclarations et des annonces ────────────────────────────────
type Declaration = {
  readonly index: number;
  readonly finAppel: number;
  readonly methode: string;
  readonly cheminDeclare: string;
};

const RE_DECLARATION =
  /\bfastify\s*\.\s*(get|post|put|patch|delete)\s*(?:<[^()]*?>)?\(\s*(['"`])([^'"`]*)\2/g;

const RE_HOOK_DEPRECIATION =
  /\bfastify\s*\.\s*addHook\s*\(\s*(['"`])onRequest\1\s*,\s*depreciee\s*\(/g;

const RE_ANNONCE = /\b(?:depreciee|annoncerDepreciation)\s*\(/g;

/** Jumelle NON globale de {@link RE_ANNONCE} : un `test()` sur un motif `/g` porte un curseur. */
const RE_ANNONCE_PRESENTE = /\b(?:depreciee|annoncerDepreciation)\s*\(/;

const RE_PLUGIN_EXPORTE = /^export\s+(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(/gm;

/** Vrai quand l'occurrence est du CODE — le masque conserve les identifiants et efface le reste. */
function estDuCode(masquee: string, index: number, jeton: string): boolean {
  return masquee.slice(index, index + jeton.length) === jeton;
}

function declarationsDuFichier(source: string, masquee: string): Declaration[] {
  const sortie: Declaration[] = [];
  RE_DECLARATION.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = RE_DECLARATION.exec(source)) !== null) {
    if (!estDuCode(masquee, m.index, 'fastify')) continue;
    const debutChaine = m.index + m[0].length - m[3].length - 1;
    const ouvrant = source.lastIndexOf('(', debutChaine);
    if (ouvrant < 0) continue;
    sortie.push({
      index: m.index,
      finAppel: finDuBloc(source, ouvrant),
      methode: m[1].toUpperCase(),
      cheminDeclare: m[3],
    });
  }
  return sortie;
}

/** Les plages `[début, fin)` des plugins EXPORTÉS du fichier, par nom. */
function pluginsExportes(source: string, masquee: string): ReadonlyArray<readonly [string, number, number]> {
  const sortie: Array<readonly [string, number, number]> = [];
  RE_PLUGIN_EXPORTE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = RE_PLUGIN_EXPORTE.exec(masquee)) !== null) {
    const ouvrantParams = source.indexOf('(', m.index);
    if (ouvrantParams < 0) continue;
    const ouvrantCorps = source.indexOf('{', finDuBloc(source, ouvrantParams));
    if (ouvrantCorps < 0) continue;
    sortie.push([m[1], m.index, finDuBloc(source, ouvrantCorps)]);
  }
  return sortie;
}

export type PorteeAnnonce = 'declaration' | 'plugin';

export type SiteAnnonce = {
  /** Chemin relatif à `src/`, séparateurs normalisés. */
  readonly fichier: string;
  readonly ligne: number;
  readonly portee: PorteeAnnonce;
  /** Le plugin EXPORTÉ qui contient le site, quand il y en a un. */
  readonly plugin: string | null;
  /** La déclaration qui CONTIENT le site — absente pour un hook de plugin ou une annonce en helper. */
  readonly declaration: Declaration | null;
};

function sitesDuFichier(fichierRelatif: string, source: string, masquee: string): SiteAnnonce[] {
  const declarations = declarationsDuFichier(source, masquee);
  const plugins = pluginsExportes(source, masquee);

  const hooks = new Set<number>();
  RE_HOOK_DEPRECIATION.lastIndex = 0;
  let h: RegExpExecArray | null;
  while ((h = RE_HOOK_DEPRECIATION.exec(source)) !== null) {
    if (!estDuCode(masquee, h.index, 'fastify')) continue;
    hooks.add(h.index + h[0].length - 'depreciee('.length);
  }

  const sortie: SiteAnnonce[] = [];
  RE_ANNONCE.lastIndex = 0;
  let a: RegExpExecArray | null;
  while ((a = RE_ANNONCE.exec(masquee)) !== null) {
    const index = a.index;
    const plugin = plugins.find(([, debut, fin]) => debut <= index && index < fin)?.[0] ?? null;
    if (hooks.has(index)) {
      sortie.push({ fichier: fichierRelatif, ligne: ligneDe(source, index), portee: 'plugin', plugin, declaration: null });
      continue;
    }
    // La déclaration qui CONTIENT le site, jamais « la plus proche en amont » :
    // une annonce posée dans un helper de module tombe APRÈS une déclaration
    // sans lui appartenir, et la lui attribuer inventerait une dépréciation.
    const declaration = declarations.find((d) => d.index < index && index < d.finAppel) ?? null;
    sortie.push({ fichier: fichierRelatif, ligne: ligneDe(source, index), portee: 'declaration', plugin, declaration });
  }
  return sortie;
}

// ── Résolution vers les adresses MONTÉES ─────────────────────────────────────
export type AdresseAnnoncee = {
  readonly method: string;
  readonly route: string;
};

export type MotifNonResolution =
  | 'plugin-de-fabrique'
  | 'chemin-interpole'
  | 'annonce-hors-declaration'
  | 'aucune-composition';

export type SiteNonResolu = {
  readonly fichier: string;
  readonly ligne: number;
  readonly motif: MotifNonResolution;
  readonly detail: string;
};

/**
 * Les préfixes sous lesquels le fichier ENTIER est monté.
 *
 * Un préfixe n'est retenu que si CHACUNE des déclarations littérales du fichier
 * y compose une adresse montée. C'est ce qui écarte `/api/v1/directory` pour
 * `friends.ts` : le répertoire ne sert ni `/friend-requests/received` ni
 * `/friend-requests/sent`, donc il ne monte pas ce fichier-là.
 */
function prefixesDuFichier(declarations: readonly Declaration[], manifeste: Manifeste): readonly string[] {
  const litterales = declarations.filter((d) => d.cheminDeclare !== '/' && !d.cheminDeclare.includes('${'));
  if (litterales.length === 0) return [];
  return manifeste.prefixes.filter((p) =>
    litterales.every((d) => manifeste.montees.has(`${d.methode} ${p}${d.cheminDeclare}`))
  );
}

/**
 * Les routes candidates d'un site : le MODULE du manifeste quand le plugin
 * englobant y est nommé, les préfixes du fichier sinon.
 *
 * Le module est PRÉCIS — il désigne exactement l'encapsulation qui a déclaré la
 * route — mais il ne couvre pas tout : la plupart des fichiers de ce dépôt
 * déclarent leurs routes dans des fonctions `registerXxxRoutes(fastify)`
 * appelées par un plugin parent, et c'est le nom du PARENT que porte le
 * manifeste. Les préfixes du fichier prennent alors le relais.
 */
function candidatsDuSite(site: SiteAnnonce, prefixes: readonly string[], manifeste: Manifeste): readonly RouteMontee[] {
  const parModule = site.plugin === null ? undefined : manifeste.parModule.get(site.plugin);
  if (parModule !== undefined) return parModule;
  return prefixes.flatMap((p) => manifeste.parPrefixe.get(p) ?? []);
}

function composer(declaration: Declaration, candidats: readonly RouteMontee[]): readonly RouteMontee[] {
  return candidats.filter((r) => {
    if (r.method !== declaration.methode) return false;
    // Un chemin `'/'` est servi SOUS le préfixe nu, pas sous « préfixe + / ».
    if (declaration.cheminDeclare === '/') return r.path === r.mountPrefix && r.mountPrefix !== '';
    return r.path === r.mountPrefix + declaration.cheminDeclare;
  });
}

// ── Ce qui ne se compose pas, et qui doit le DIRE ────────────────────────────
export type DeclarationHorsComposition = {
  /** Chemin relatif à `src/`, séparateurs normalisés. */
  readonly fichier: string;
  readonly motif: MotifNonResolution;
  /** Pourquoi la composition est impossible ICI — pas ce que le site fait. */
  readonly raison: string;
  /** Les adresses MONTÉES que ce site déprécie. Chacune est confrontée au manifeste. */
  readonly adresses: readonly AdresseAnnoncee[];
};

const CATEGORIES_PREFERENCES = ['privacy', 'audio', 'message', 'notification', 'video', 'document', 'application'];

/**
 * Les trois sites que la composition ne peut pas résoudre, et ce qu'ils couvrent.
 *
 * Une déclaration n'EXCUSE rien : elle COMPLÈTE le balayage, et se paie de deux
 * vérifications — ses adresses doivent être montées, et son site doit exister
 * (une déclaration devenue sans objet est un mensonge qui dort).
 */
export const DECLARATIONS_HORS_COMPOSITION: readonly DeclarationHorsComposition[] = Object.freeze([
  {
    fichier: 'routes/me/preferences/preference-router-factory.ts',
    motif: 'plugin-de-fabrique',
    raison:
      "L'annonce est un hook de plugin, et le plugin est le retour d'une FABRIQUE " +
      "(`createPreferenceRouter`) : le manifeste ne connaît son montage que sous un nom anonyme " +
      "partagé par tout le sous-arbre `/api/v1/me/preferences`. Les vingt-huit adresses ci-dessous " +
      'sont les quatre verbes des sept catégories, montés une fois par appel de la fabrique.',
    adresses: CATEGORIES_PREFERENCES.flatMap((categorie) =>
      ['GET', 'PUT', 'PATCH', 'DELETE'].map((method) => ({
        method,
        route: `/api/v1/me/preferences/${categorie}`,
      }))
    ),
  },
  {
    fichier: 'routes/user-deletions.ts',
    motif: 'chemin-interpole',
    raison:
      "Le chemin déclaré est un GABARIT (`${basePath}/conversations/:conversationId/delete-for-me`) " +
      "dont le préfixe vient des options du plugin (`opts.basePath || '/api'`) : aucune composition " +
      "statique ne le rend. Seule cette route du module porte l'annonce — les six autres sont des " +
      "`known-gap` sans successeur, pas des alias en sursis.",
    adresses: [{ method: 'DELETE', route: '/api/conversations/:conversationId/delete-for-me' }],
  },
  {
    fichier: 'socketio/socketio-admin-routes.ts',
    motif: 'annonce-hors-declaration',
    raison:
      "L'annonce vit dans un helper de module (`aliasNonVersionne`) que les deux déclarations " +
      'RÉFÉRENCENT en `onRequest` sans la contenir : le site tombe hors de tout appel ' +
      '`fastify.<verbe>(...)`. Les deux adresses sont les alias non versionnés des gestes ' +
      "d'administration Socket.IO.",
    adresses: [
      { method: 'GET', route: '/api/socketio/stats' },
      { method: 'POST', route: '/api/socketio/disconnect-user' },
    ],
  },
]);

// ── Le balayage complet ──────────────────────────────────────────────────────
export type AdresseDepreciee = AdresseAnnoncee & {
  /** Le premier site qui l'annonce — de quoi retrouver la source du verdict. */
  readonly fichier: string;
  readonly ligne: number;
};

export type ResultatCouverture = {
  readonly fichiersVisites: number;
  readonly sites: readonly SiteAnnonce[];
  readonly adresses: readonly AdresseDepreciee[];
  readonly nonResolus: readonly SiteNonResolu[];
};

function cleDeclaration(fichier: string, motif: MotifNonResolution): string {
  return `${fichier}#${motif}`;
}

const DECLARATIONS_PAR_CLE: ReadonlyMap<string, DeclarationHorsComposition> = new Map(
  DECLARATIONS_HORS_COMPOSITION.map((d) => [cleDeclaration(d.fichier, d.motif), d])
);

export function balayerCouvertureDepreciation(
  racine: string = RACINE_SRC,
  manifeste: Manifeste = lireManifeste()
): ResultatCouverture {
  const fichiers = fichiersAnalyses(racine);
  const sites: SiteAnnonce[] = [];
  const nonResolus: SiteNonResolu[] = [];
  const adresses = new Map<string, AdresseDepreciee>();

  const retenir = (route: RouteMontee, site: SiteAnnonce): void => {
    const cle = `${route.method} ${route.path}`;
    if (adresses.has(cle)) return;
    adresses.set(cle, { method: route.method, route: route.path, fichier: site.fichier, ligne: site.ligne });
  };

  for (const chemin of fichiers) {
    const source = readFileSync(chemin, 'utf8');
    if (!RE_ANNONCE_PRESENTE.test(source)) continue;

    const masquee = masquerPourLocaliser(source);
    const fichierRelatif = relative(RACINE_SRC, chemin).split(sep).join('/');
    const declarations = declarationsDuFichier(source, masquee);
    const prefixes = prefixesDuFichier(declarations, manifeste);

    for (const site of sitesDuFichier(fichierRelatif, source, masquee)) {
      sites.push(site);
      const candidats = candidatsDuSite(site, prefixes, manifeste);

      if (site.portee === 'plugin') {
        if (candidats.length === 0) {
          nonResolus.push({ ...position(site), motif: 'plugin-de-fabrique', detail: site.plugin ?? '(hors plugin exporté)' });
          continue;
        }
        for (const route of candidats) retenir(route, site);
        continue;
      }

      if (site.declaration === null) {
        nonResolus.push({ ...position(site), motif: 'annonce-hors-declaration', detail: site.plugin ?? '(hors plugin exporté)' });
        continue;
      }
      if (site.declaration.cheminDeclare.includes('${')) {
        nonResolus.push({ ...position(site), motif: 'chemin-interpole', detail: `${site.declaration.methode} ${site.declaration.cheminDeclare}` });
        continue;
      }
      const composees = composer(site.declaration, candidats);
      if (composees.length === 0) {
        nonResolus.push({ ...position(site), motif: 'aucune-composition', detail: `${site.declaration.methode} ${site.declaration.cheminDeclare}` });
        continue;
      }
      for (const route of composees) retenir(route, site);
    }
  }

  for (const site of nonResolus) {
    const declaree = DECLARATIONS_PAR_CLE.get(cleDeclaration(site.fichier, site.motif));
    if (declaree === undefined) continue;
    for (const adresse of declaree.adresses) {
      const cle = `${adresse.method} ${adresse.route}`;
      if (adresses.has(cle)) continue;
      adresses.set(cle, { ...adresse, fichier: site.fichier, ligne: site.ligne });
    }
  }

  return {
    fichiersVisites: fichiers.length,
    sites,
    adresses: Array.from(adresses.values()),
    nonResolus,
  };
}

function position(site: SiteAnnonce): { readonly fichier: string; readonly ligne: number } {
  return { fichier: site.fichier, ligne: site.ligne };
}

// ── Les trois verdicts que le témoin lit ─────────────────────────────────────
export type AdresseNonCouverte = AdresseDepreciee;

/** Les adresses dépréciées qu'aucun seau ne matérialise — la liste qui doit être VIDE. */
export function adressesSansCompteur(
  resultat: ResultatCouverture,
  surveillees: ReadonlySet<string>
): readonly AdresseNonCouverte[] {
  return resultat.adresses.filter((a) => !surveillees.has(`${a.method} ${a.route}`));
}

/** Les sites qu'aucune composition ni aucune déclaration ne rend — la liste qui doit être VIDE. */
export function sitesOrphelins(resultat: ResultatCouverture): readonly SiteNonResolu[] {
  return resultat.nonResolus.filter(
    (s) => !DECLARATIONS_PAR_CLE.has(cleDeclaration(s.fichier, s.motif))
  );
}

export type DeclarationInvalide = {
  readonly fichier: string;
  readonly motif: MotifNonResolution;
  readonly grief: 'declaration-perimee' | 'raison-vide' | 'adresse-non-montee' | 'sans-adresse';
  readonly detail: string;
};

/** Ce qu'une déclaration hors composition doit tenir pour valoir preuve. */
export function declarationsInvalides(
  resultat: ResultatCouverture,
  manifeste: Manifeste = lireManifeste()
): readonly DeclarationInvalide[] {
  const rencontres = new Set(resultat.nonResolus.map((s) => cleDeclaration(s.fichier, s.motif)));
  return DECLARATIONS_HORS_COMPOSITION.flatMap((d): DeclarationInvalide[] => {
    const base = { fichier: d.fichier, motif: d.motif };
    if (!rencontres.has(cleDeclaration(d.fichier, d.motif))) {
      return [{ ...base, grief: 'declaration-perimee', detail: 'aucun site de ce motif dans ce fichier' }];
    }
    if (d.raison.trim() === '') return [{ ...base, grief: 'raison-vide', detail: '' }];
    if (d.adresses.length === 0) return [{ ...base, grief: 'sans-adresse', detail: '' }];
    return d.adresses
      .filter((a) => !manifeste.montees.has(`${a.method} ${a.route}`))
      .map((a) => ({ ...base, grief: 'adresse-non-montee' as const, detail: `${a.method} ${a.route}` }));
  });
}
