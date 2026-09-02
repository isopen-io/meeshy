/**
 * Balayage : chaque successeur ANNONCÉ émet-il une chaîne SUIVABLE ?
 *
 * `deprecated-alias-headers-guard.test.ts` vérifiait cette propriété par un
 * PROXY — `it.each(['admin/users-write.ts', 'users/blocking.ts'])`, deux
 * fichiers écrits à la main — et par un MOTIF qui ne lit qu'un successeur en
 * chaîne littérale (`/successeur: '[^']*:[a-zA-Z]/`), sa justification étant
 * « les successeurs paramétrés se déclarent en FONCTION ». C'est vrai, et ça
 * ne suffit pas : une FONCTION peut tout aussi bien émettre un segment `:param`
 * non résolu — c'est exactement ce qu'a fait `message-read-status.ts` (#4423)
 * avant cette revue, sans faire rougir personne. Le proxy « est-ce une
 * fonction ? » ne couvre pas la propriété visée « la chaîne émise est-elle
 * suivable ? ».
 *
 * Ce module BALAYE tout `routes/` et, pour chaque site `depreciee(...)` /
 * `annoncerDepreciation(...)`, ÉVALUE réellement l'`AdresseDepreciee` qu'il
 * emploie — pas seulement sa FORME. Deux temps :
 *
 *   1. résoudre l'EXPRESSION passée en argument (littéral inline, référence à
 *      une const de même fichier, accès de propriété sur une const groupée,
 *      ou appel d'une fonction de même fichier qui RETOURNE une
 *      `AdresseDepreciee` — le patron de `users/profile.ts`) en réunissant,
 *      TRANSITIVEMENT, les déclarations de même fichier qu'elle cite ;
 *   2. TRANSPILER ce fragment (le compilateur TypeScript, pour ne pas
 *      réécrire à la main un dépouilleur de types) et l'EXÉCUTER pour de
 *      vrai, avec une requête FABRIQUÉE dont `params`/`query` rendent une
 *      valeur factice pour N'IMPORTE QUEL nom lu — un `Proxy`, pour ne pas
 *      avoir à énumérer `id`/`conversationId`/`messageId`/`userId`/… à la
 *      main, l'angle mort exact d'une énumération.
 *
 * La chaîne RÉELLEMENT rendue (littérale, ou rendue par la fonction appelée)
 * est alors jugée : contient-elle encore un segment `:motParam` ? Si oui, le
 * `Link` qu'elle composera n'est pas suivable — quelle qu'ait été la FORME de
 * sa déclaration.
 *
 * Ce que ce balayage ne fait PAS : il n'exécute aucune route, aucun Prisma,
 * aucun Fastify — seule l'expression `successeur` (et ce dont elle dépend
 * dans le MÊME fichier) est évaluée, en isolation. Une dépendance CROISÉE
 * (un fichier qui importerait le générateur d'un AUTRE fichier de routes)
 * ferait échouer l'évaluation plutôt que de mentir : voir `erreur` sur le
 * résultat, distinct de `suivable`.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import * as ts from 'typescript';

export const RACINE_ROUTES = join(__dirname, '..', '..', 'routes');
const CHEMIN_UTILS_DEPRECATION = join(__dirname, '..', '..', 'utils', 'deprecation.ts');
/** `apiPath` (packages/shared) est la SEULE autre dépendance HORS fichier — pure, sans effet de bord. */
const CHEMIN_API_PREFIX = join(__dirname, '..', '..', '..', '..', '..', 'packages', 'shared', 'api', 'prefix.ts');
/**
 * `socialEventsDeprecation` (#4150) — le sursis PARTAGÉ par les six alias de
 * télémétrie de lecture. Troisième dépendance pure hors fichier : elle n'importe
 * que `dateDeRetrait` et `apiPath`, les deux que ce balayage résout déjà.
 *
 * Elle vit dans son propre module EXACTEMENT pour être ici : la déclarer dans
 * `routes/social/events.ts` — qui importe Prisma, Fastify et `PostService` —
 * la mettrait hors de portée de toute évaluation, et ses six sites tomberaient
 * dans la colonne `erreur` faute d'être mesurables. Un successeur PARTAGÉ par
 * six adresses est celui qu'on veut le plus vérifier, pas le moins.
 */
const CHEMIN_SOCIAL_DEPRECATION = join(__dirname, '..', '..', 'routes', 'social', 'deprecation.ts');

const REPERTOIRES_IGNORES = new Set(['__tests__', 'node_modules']);

export function fichiersDeRoutes(racine: string, acc: string[] = []): string[] {
  for (const entree of readdirSync(racine)) {
    const chemin = join(racine, entree);
    if (statSync(chemin).isDirectory()) {
      if (!REPERTOIRES_IGNORES.has(entree)) fichiersDeRoutes(chemin, acc);
      continue;
    }
    if (entree.endsWith('.ts') && !entree.endsWith('.test.ts')) acc.push(chemin);
  }
  return acc;
}

// ── Lecture consciente des chaînes/gabarits/commentaires ─────────────────────
type Mode = null | "'" | '"' | '`' | '//' | '/*';

/**
 * Remplace commentaires ET contenu des chaînes/gabarits par des espaces (les
 * DÉLIMITEURS compris), SANS changer la longueur — pour LOCALISER un mot-clé
 * ou une déclaration par une simple regex sans tomber sur son occurrence dans
 * un commentaire ou une chaîne. N'est JAMAIS utilisée pour EXTRAIRE un texte
 * (voir plus bas les fonctions qui marchent sur la source RÉELLE).
 */
function masquerPourLocaliser(source: string): string {
  const sortie = source.split('');
  const n = source.length;
  let i = 0;
  const effacer = (p: number): void => {
    if (source[p] !== '\n') sortie[p] = ' ';
  };
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

/**
 * Avance depuis un OUVRANT `(`/`{`/`[` (position `debut`, sur la source
 * RÉELLE) jusqu'à l'index qui SUIT son fermant — ignore chaînes, gabarits
 * (traités comme un jeton OPAQUE : leurs `${…}` internes ne comptent pas dans
 * la profondeur, exactement le patron d'`apresLeFermant` dans
 * `alias-deprecation-guard.test.ts`, réécrit ici indépendamment pour ce
 * fichier) et commentaires.
 */
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

/** Étend depuis un guillemet/gabarit OUVRANT (position `depart`) jusqu'à son fermant NON échappé. */
function finDeChaine(source: string, depart: number): number {
  const q = source[depart];
  let i = depart + 1;
  while (i < source.length) {
    if (source[i] === '\\') { i += 2; continue; }
    if (source[i] === q) return i + 1;
    i += 1;
  }
  return source.length;
}

/**
 * Étend un corps d'EXPRESSION nu (gabarit hors chaîne/objet, appel, opérateur
 * `??`…) jusqu'au `;` de PREMIER niveau — le seul terminateur fiable dans ce
 * dépôt, où chaque déclaration top-level en porte un.
 */
function finDeCorpsExpression(source: string, depart: number): number {
  let profondeur = 0;
  let i = depart;
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
      } else if (c === '*' && suivant === '/') { mode = null; i += 2; continue; }
      i += 1; continue;
    }
    if (c === '/' && suivant === '/') { mode = '//'; i += 2; continue; }
    if (c === '/' && suivant === '*') { mode = '/*'; i += 2; continue; }
    if (c === "'" || c === '"' || c === '`') { mode = c; i += 1; continue; }
    if (c === '(' || c === '{' || c === '[') { profondeur += 1; i += 1; continue; }
    if (c === ')' || c === '}' || c === ']') { profondeur -= 1; i += 1; continue; }
    if (c === ';' && profondeur <= 0) return i;
    i += 1;
  }
  return i;
}

/**
 * Étend depuis le PREMIER caractère significatif d'une VALEUR (juste après le
 * `=` d'une déclaration) jusqu'à sa fin RÉELLE — objet littéral, chaîne,
 * gabarit, fonction fléchée (paramètres PUIS, une fois une éventuelle
 * annotation de type de retour `: Type` sautée, `=>` et son corps — bloc OU
 * expression), ou jeton nu.
 */
function finDeValeur(source: string, depart: number): number {
  const c0 = source[depart];

  if (c0 === "'" || c0 === '"' || c0 === '`') return finDeChaine(source, depart);

  if (c0 === '{' || c0 === '[') return finDuBloc(source, depart);

  if (c0 === '(') {
    // Boucle pour les fonctions fléchées CURRIFIÉES — `(a) => (b) => \`…\``
    // (`versLaFicheDe`, `admin/users-write.ts`) : le CORPS du premier niveau
    // est lui-même une fléchée, dont il faut retrouver À SON TOUR la fin.
    let position = depart;
    for (let garde = 0; garde < 6; garde += 1) {
      const finParametres = finDuBloc(source, position);
      let apres = finParametres;
      while (apres < source.length && /\s/.test(source[apres])) apres += 1;
      if (source[apres] === ':') {
        // Annotation de type de retour — bornée, sans '=>' à l'intérieur
        // dans les formes que ce dépôt écrit (`: string`, `: void`…).
        const fleche = source.indexOf('=>', apres);
        if (fleche >= 0 && fleche - apres < 300) apres = fleche;
      }
      if (source.slice(apres, apres + 2) !== '=>') return finParametres; // parenthèse nue, pas une fléchée
      let curseur = apres + 2;
      while (curseur < source.length && /\s/.test(source[curseur])) curseur += 1;
      if (source[curseur] === '{') return finDuBloc(source, curseur); // corps BLOC : terminal
      if (source[curseur] === '(') { position = curseur; continue; } // encore une fléchée : reboucle
      return finDeCorpsExpression(source, curseur); // corps EXPRESSION nu : terminal
    }
    return finDuBloc(source, depart);
  }

  return finDeCorpsExpression(source, depart);
}

/** Découpe l'intérieur d'un bloc (déjà délimité) par ses séparateurs de PREMIER niveau. */
function segmentsDeNiveau1(texte: string, separateur: string): string[] {
  const sortie: string[] = [];
  let profondeur = 0;
  let debut = 0;
  let i = 0;
  let mode: Mode = null;
  while (i < texte.length) {
    const c = texte[i];
    const suivant = texte[i + 1];
    if (mode !== null) {
      if (mode === "'" || mode === '"' || mode === '`') {
        if (c === '\\') { i += 2; continue; }
        if (c === mode) mode = null;
      } else if (mode === '//') {
        if (c === '\n') mode = null;
      } else if (c === '*' && suivant === '/') { mode = null; i += 2; continue; }
      i += 1; continue;
    }
    if (c === '/' && suivant === '/') { mode = '//'; i += 2; continue; }
    if (c === '/' && suivant === '*') { mode = '/*'; i += 2; continue; }
    if (c === "'" || c === '"' || c === '`') { mode = c; i += 1; continue; }
    if (c === '(' || c === '{' || c === '[') { profondeur += 1; i += 1; continue; }
    if (c === ')' || c === '}' || c === ']') { profondeur -= 1; i += 1; continue; }
    if (c === separateur && profondeur === 0) { sortie.push(texte.slice(debut, i)); debut = i + 1; i += 1; continue; }
    i += 1;
  }
  sortie.push(texte.slice(debut));
  return sortie;
}

// ── Localiser les sites d'appel ────────────────────────────────────────────
type SiteAppel = {
  readonly fichier: string;
  readonly ligne: number;
  /** Le TEXTE de l'expression passée comme `adresse` — verbatim, TS compris. */
  readonly expression: string;
  /** Verbe + chemin littéral de la route ENGLOBANTE, si trouvable — pour une clé stable des sites INLINE. */
  readonly routeEnglobante: string | null;
};

const RE_ROUTE_ENGLOBANTE =
  /\bfastify\s*\.\s*(get|post|put|patch|delete)\s*(?:<[^()]*?>)?\(\s*(['"`])([^'"`]*)\2/g;

function routeEnglobante(masquee: string, avantIndex: number): string | null {
  RE_ROUTE_ENGLOBANTE.lastIndex = 0;
  let dernier: RegExpExecArray | null = null;
  let m: RegExpExecArray | null;
  while ((m = RE_ROUTE_ENGLOBANTE.exec(masquee)) !== null) {
    if (m.index >= avantIndex) break;
    dernier = m;
  }
  return dernier ? `${dernier[1].toUpperCase()} ${dernier[3]}` : null;
}

function ligneDe(source: string, index: number): number {
  return source.slice(0, index).split('\n').length;
}

/**
 * Les sites `depreciee(ADRESSE)` et `annoncerDepreciation(reply, ADRESSE, …)`
 * d'UN fichier. Le second argument, pour `annoncerDepreciation`, est
 * l'ADRESSE — `reply` est toujours le premier, `request?` un troisième
 * optionnel. Localise via le texte MASQUÉ (une occurrence dans un
 * commentaire ne doit pas compter comme un site) ; extrait via la source
 * RÉELLE, dont `finDuBloc`/`segmentsDeNiveau1` ignorent eux-mêmes chaînes et
 * commentaires — inutile de refaire le masquage pour l'extraction.
 */
export function sitesDuFichier(fichier: string, source: string): SiteAppel[] {
  const masquee = masquerPourLocaliser(source);
  const sortie: SiteAppel[] = [];

  for (const [motif, indexAdresse] of [
    [/\bdepreciee\s*\(/g, 0],
    [/\bannoncerDepreciation\s*\(/g, 1],
  ] as const) {
    const re = new RegExp(motif.source, 'g');
    let m: RegExpExecArray | null;
    while ((m = re.exec(masquee)) !== null) {
      const ouvrant = m.index + m[0].length - 1;
      const fin = finDuBloc(source, ouvrant);
      const interieur = source.slice(ouvrant + 1, fin - 1);
      const args = segmentsDeNiveau1(interieur, ',');
      const expr = (args[indexAdresse] ?? '').trim();
      if (expr === '') continue;

      sortie.push({
        fichier,
        ligne: ligneDe(source, m.index),
        expression: expr,
        routeEnglobante: routeEnglobante(source, m.index),
      });
    }
  }
  return sortie;
}

// ── Réunir les définitions de même fichier dont l'expression dépend ─────────
const MOTS_RESERVES = new Set([
  // Contrat successeur / types du dépôt.
  'request', 'reply', 'as', 'FastifyRequest', 'FastifyReply', 'Readonly',
  'Record', 'AdresseDepreciee', 'encodeURIComponent', 'params', 'query',
  'headers', 'url',
  // Mots-clés TS/JS pouvant apparaître dans un fragment de déclaration —
  // aucun n'est une RÉFÉRENCE à résoudre.
  'export', 'import', 'from', 'default', 'const', 'let', 'var', 'function',
  'return', 'if', 'else', 'for', 'while', 'do', 'switch', 'case', 'break',
  'continue', 'try', 'catch', 'finally', 'throw', 'new', 'this', 'super',
  'class', 'extends', 'implements', 'interface', 'type', 'enum', 'namespace',
  'declare', 'abstract', 'public', 'private', 'protected', 'static', 'async',
  'await', 'yield', 'of', 'in', 'instanceof', 'delete', 'typeof', 'void',
  'null', 'undefined', 'true', 'false', 'string', 'number', 'boolean', 'any',
  'unknown', 'never', 'object', 'symbol', 'bigint', 'readonly',
  // Globaux JS valides sans déclaration dans un module CommonJS.
  'Math', 'Date', 'JSON', 'Object', 'Array', 'Number', 'Boolean', 'String',
  'RegExp', 'Error', 'Promise', 'console', 'process', 'module', 'exports',
  'require', 'global', 'Buffer', 'Map', 'Set', 'Symbol',
]);

/**
 * Les identifiants CITÉS COMME CODE d'un fragment — jamais les mots trouvés
 * À L'INTÉRIEUR d'une chaîne ou de la partie STATIQUE d'un gabarit (sans quoi
 * `'/api/v1/me/permissions'` cite « api », « v1 », « me », « permissions »
 * comme s'il s'agissait de RÉFÉRENCES à résoudre). Un gabarit reste
 * traversé : ses `${…}` SONT du code, et c'est justement là que vivent les
 * références réelles (`encodeURIComponent(handle)`).
 */
function identifiantsCites(texte: string): string[] {
  const trouves: string[] = [];
  let i = 0;
  let mode: Mode = null;
  // Profondeur d'accolades DANS chaque `${…}` en cours — pour savoir si un
  // `}` referme l'interpolation (retour en mode gabarit) ou un objet
  // ORDINAIRE écrit À L'INTÉRIEUR de cette interpolation.
  const pileGabarit: number[] = [];

  while (i < texte.length) {
    const c = texte[i];
    const suivant = texte[i + 1];

    if (mode === "'" || mode === '"') {
      if (c === '\\') { i += 2; continue; }
      if (c === mode) mode = null;
      i += 1; continue;
    }
    if (mode === '//') { if (c === '\n') mode = null; i += 1; continue; }
    if (mode === '/*') { if (c === '*' && suivant === '/') { mode = null; i += 2; continue; } i += 1; continue; }
    if (mode === '`') {
      if (c === '\\') { i += 2; continue; }
      if (c === '$' && suivant === '{') { mode = null; pileGabarit.push(0); i += 2; continue; }
      if (c === '`') { mode = null; i += 1; continue; }
      i += 1; continue;
    }

    // mode === null : CODE — au premier niveau, ou dans un `${…}`.
    if (c === '/' && suivant === '/') { mode = '//'; i += 2; continue; }
    if (c === '/' && suivant === '*') { mode = '/*'; i += 2; continue; }
    if (c === "'" || c === '"') { mode = c; i += 1; continue; }
    if (c === '`') { mode = '`'; i += 1; continue; }
    if (pileGabarit.length > 0) {
      if (c === '{') { pileGabarit[pileGabarit.length - 1] += 1; i += 1; continue; }
      if (c === '}') {
        if (pileGabarit[pileGabarit.length - 1] === 0) { pileGabarit.pop(); mode = '`'; i += 1; continue; }
        pileGabarit[pileGabarit.length - 1] -= 1; i += 1; continue;
      }
    }
    if (/[A-Za-z_$]/.test(c)) {
      let j = i + 1;
      while (j < texte.length && /[\w$]/.test(texte[j])) j += 1;
      // `.propName` NOMME une propriété, jamais une référence à résoudre —
      // sans cette exclusion, `(request.params as X).userId` cite `userId`
      // comme s'il fallait lui trouver une déclaration de même fichier.
      if (texte[i - 1] !== '.') trouves.push(texte.slice(i, j));
      i = j; continue;
    }
    i += 1;
  }
  return trouves.filter((nom) => !MOTS_RESERVES.has(nom));
}

/**
 * Le corps d'une déclaration `const NOM = …` / `function NOM(…) {…}` de
 * PREMIER niveau (colonne 0) du fichier — jamais une variable interne à un
 * handler, dont capturer le nom porterait un risque de collision. Localise
 * via le texte MASQUÉ, extrait via la source RÉELLE (`finDeValeur`) — la
 * valeur peut être un objet, une chaîne, un gabarit, ou une fonction fléchée
 * (avec ou sans annotation de type de retour).
 */
function corpsDeLaDeclaration(masquee: string, lisible: string, nom: string): string | null {
  // Regex CONSTRUITE : `\s`/`\b` doivent être DOUBLE-échappés dans ce texte
  // (`\\s`, `\\b`) — un gabarit littéral (contrairement à un `/…/` posé en
  // dur) applique d'abord les règles d'échappement des CHAÎNES JS, qui
  // avalent silencieusement un `\s` non double-échappé (rendu `s` nu) et
  // transforment un `\b` en caractère de RETOUR ARRIÈRE (U+0008, pas le mot
  // « limite de mot » du moteur regex). Piège mesuré sur ce site précis.
  const re = new RegExp(`^(?:export\\s+)?(?:const|function)\\s+${nom}\\b`, 'm');
  const decl = re.exec(masquee);
  if (decl === null) return null;

  const estFonctionDeclaree = /function\s+\w/.test(decl[0]);
  if (estFonctionDeclaree) {
    const ouvrantParams = lisible.indexOf('(', decl.index);
    if (ouvrantParams < 0) return null;
    const finParams = finDuBloc(lisible, ouvrantParams);
    const ouvrantCorps = lisible.indexOf('{', finParams);
    if (ouvrantCorps < 0) return null;
    return lisible.slice(decl.index, finDuBloc(lisible, ouvrantCorps));
  }

  const egal = lisible.indexOf('=', decl.index);
  if (egal < 0) return null;
  let depart = egal + 1;
  while (depart < lisible.length && /\s/.test(lisible[depart])) depart += 1;
  if (depart >= lisible.length) return null;

  return lisible.slice(decl.index, finDeValeur(lisible, depart));
}

/** Réunit, TRANSITIVEMENT, les déclarations de même fichier qu'une expression cite. */
function dependancesDeMemeFichier(expression: string, masquee: string, lisible: string): string[] {
  const trouvees = new Map<string, string>();
  let frontiere = identifiantsCites(expression);
  for (let passe = 0; passe < 8 && frontiere.length > 0; passe += 1) {
    const suivante: string[] = [];
    for (const nom of frontiere) {
      if (trouvees.has(nom)) continue;
      const corps = corpsDeLaDeclaration(masquee, lisible, nom);
      trouvees.set(nom, corps ?? ''); // marque VUE même si introuvable — pas de boucle infinie
      if (corps !== null) suivante.push(...identifiantsCites(corps));
    }
    frontiere = suivante;
  }
  return Array.from(trouvees.values()).filter((v) => v !== '').reverse();
}

// ── Évaluation réelle ────────────────────────────────────────────────────────
const VALEUR_FACTICE = 'FAKE_PARAM_507f1f77bcf86cd799439aa';

function requeteFabriquee(): unknown {
  const proxy = () =>
    new Proxy(
      {},
      {
        get(_t, prop) {
          if (typeof prop === 'symbol') return undefined;
          return VALEUR_FACTICE;
        },
      }
    );
  return {
    params: proxy(),
    query: proxy(),
    headers: {},
    url: '/api/fake/sweep/url',
  };
}

export type ResultatEvaluation =
  | { readonly ok: true; readonly chaineEmise: string; readonly typeSuccesseur: 'string' | 'function' }
  | { readonly ok: false; readonly raison: string };

/**
 * Transpile (compilateur TypeScript — pas de dépouilleur de types écrit à la
 * main) puis EXÉCUTE l'expression `adresse`, ses dépendances de même fichier
 * fournies en préambule. `dateDeRetrait` (pure, importée de
 * `utils/deprecation.ts`) est résolue pour de vrai — c'est la seule
 * dépendance HORS fichier que ce patron rencontre dans ce dépôt.
 */
/**
 * Le nom déclaré par un fragment `const NOM = …` / `function NOM(…)` déjà
 * extrait — pour distinguer, parmi les identifiants cités, ceux qui restent
 * SANS déclaration dans le préambule.
 */
function nomDeclare(corps: string): string | null {
  const m = /^(?:export\s+)?(?:const|function)\s+([A-Za-z_$][\w$]*)/.exec(corps);
  return m ? m[1] : null;
}

/**
 * Les TROIS importations pures, hors fichier, que ce patron rencontre dans ce
 * dépôt — `dateDeRetrait` (fenêtre de retrait), `apiPath` (préfixe de version)
 * et `socialEventsDeprecation` (#4150, le sursis partagé par six alias). Toutes
 * sans effet de bord, RÉSOLUES pour de vrai plutôt que fabriquées : leur
 * composition FAIT PARTIE de ce qu'un balayage de suivabilité doit vérifier.
 */
const IMPORTS_PURS_CONNUS: ReadonlyArray<readonly [string, string]> = [
  ['dateDeRetrait', CHEMIN_UTILS_DEPRECATION],
  ['apiPath', CHEMIN_API_PREFIX],
  ['socialEventsDeprecation', CHEMIN_SOCIAL_DEPRECATION],
];

export function evaluerSuccesseur(site: SiteAppel, source: string): ResultatEvaluation {
  const masquee = masquerPourLocaliser(source);
  const dependances = dependancesDeMemeFichier(site.expression, masquee, source);

  const nomsDeclares = new Set(dependances.map(nomDeclare).filter((n): n is string => n !== null));
  const nomsImportes = new Set(IMPORTS_PURS_CONNUS.map(([n]) => n));
  const references = new Set([
    ...identifiantsCites(site.expression),
    ...dependances.flatMap(identifiantsCites),
  ]);

  // Ce qui reste CITÉ sans être ni déclaré dans le préambule ni un import PUR
  // connu : le cas mesuré est `annonceProfil(username)` (`users/profile.ts`)
  // — `username`/`id` sont des variables du HANDLER, jamais des consts de
  // module. Une valeur FACTICE, jamais un `ReferenceError`, faute de quoi
  // l'évaluation échouerait pour une raison qui n'a rien à voir avec la
  // suivabilité du successeur.
  const manquants = Array.from(references).filter(
    (nom) => !nomsDeclares.has(nom) && !nomsImportes.has(nom)
  );

  const module = [
    ...IMPORTS_PURS_CONNUS.map(([nom, chemin]) => `const { ${nom} } = require(${JSON.stringify(chemin)});`),
    ...manquants.map((nom) => `const ${nom} = ${JSON.stringify(VALEUR_FACTICE)};`),
    ...dependances,
    `module.exports = (${site.expression});`,
  ].join('\n');

  let js: string;
  try {
    js = ts.transpileModule(module, {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2019,
        strict: false,
      },
    }).outputText;
  } catch (erreur) {
    return { ok: false, raison: `transpilation: ${(erreur as Error).message}` };
  }

  const fauxModule: { exports: unknown } = { exports: {} };
  try {
    const fn = new Function('module', 'exports', 'require', js);
    fn(fauxModule, fauxModule.exports, require);
  } catch (erreur) {
    return { ok: false, raison: `exécution: ${(erreur as Error).message}` };
  }

  const adresse = fauxModule.exports;
  if (typeof adresse !== 'object' || adresse === null || !('successeur' in adresse)) {
    return { ok: false, raison: `aucun champ successeur sur la valeur rendue (${typeof adresse})` };
  }

  if (typeof adresse.successeur === 'string') {
    return { ok: true, chaineEmise: adresse.successeur, typeSuccesseur: 'string' };
  }
  if (typeof adresse.successeur === 'function') {
    try {
      const rendu = (adresse.successeur as (r: unknown) => unknown)(requeteFabriquee());
      if (typeof rendu !== 'string') {
        return { ok: false, raison: `la fonction successeur ne rend pas une chaîne (${typeof rendu})` };
      }
      return { ok: true, chaineEmise: rendu, typeSuccesseur: 'function' };
    } catch (erreur) {
      return { ok: false, raison: `appel du successeur: ${(erreur as Error).message}` };
    }
  }
  return { ok: false, raison: `successeur d'un type inattendu (${typeof adresse.successeur})` };
}

// ── Le balayage complet ───────────────────────────────────────────────────────
export type Finding = {
  readonly cle: string;
  readonly fichier: string;
  readonly ligne: number;
  readonly expression: string;
  readonly evaluation: ResultatEvaluation;
  readonly suivable: boolean;
};

const RE_SEGMENT_GABARIT = /:[a-zA-Z]/;

function cleDeSite(relFichier: string, site: SiteAppel): string {
  // Une référence simple (`IDENT`, `IDENT.PROP`, `IDENT(args)`) est une clé
  // STABLE en soi — son propre nom ne dérive pas au fil des éditions
  // alentour. Un littéral INLINE n'en a pas : on l'ancre sur la route
  // ENGLOBANTE (verbe + chemin), stable pour la même raison ; à défaut
  // (introuvable), sur la ligne — dernier recours, marqué comme tel.
  const estReferenceSimple = /^[A-Za-z_$][\w$]*(\.[A-Za-z_$][\w$]*)?(\([^()]*\))?$/.test(
    site.expression.replace(/\s+/g, ' ').trim()
  );
  if (estReferenceSimple) return `${relFichier}#${site.expression.replace(/\s+/g, ' ').trim()}`;
  if (site.routeEnglobante) return `${relFichier}#<inline:${site.routeEnglobante}>`;
  return `${relFichier}#<inline:ligne ${site.ligne}>`;
}

export type ResultatBalayage = {
  readonly fichiersVisites: number;
  readonly findings: readonly Finding[];
};

export function balayerSuccesseurs(racine: string = RACINE_ROUTES): ResultatBalayage {
  const fichiers = fichiersDeRoutes(racine);
  const vus = new Set<string>();
  const findings: Finding[] = [];

  for (const chemin of fichiers) {
    const source = readFileSync(chemin, 'utf8');
    const relFichier = relative(racine, chemin).split(sep).join('/');
    const sites = sitesDuFichier(chemin, source);

    for (const site of sites) {
      const cle = cleDeSite(relFichier, site);
      if (vus.has(cle)) continue; // une const partagée par PLUSIEURS routes ne s'évalue qu'une fois
      vus.add(cle);

      // Un site imprévu ne doit jamais faire tomber la COLLECTE des autres —
      // sans quoi une seule anomalie masquerait le verdict de tous les
      // autres. Il devient un `finding` NOMMÉ, jamais fautif ⇒ visible.
      let evaluation: ResultatEvaluation;
      try {
        evaluation = evaluerSuccesseur(site, source);
      } catch (erreur) {
        evaluation = { ok: false, raison: `balayage: ${(erreur as Error).message}` };
      }
      const suivable = evaluation.ok && !RE_SEGMENT_GABARIT.test(evaluation.chaineEmise);
      findings.push({ cle, fichier: relFichier, ligne: site.ligne, expression: site.expression, evaluation, suivable });
    }
  }

  return { fichiersVisites: fichiers.length, findings };
}
