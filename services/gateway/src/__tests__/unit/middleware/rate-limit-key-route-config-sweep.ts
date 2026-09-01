/**
 * Balayage : d'où vient chaque `config.rateLimit` du gateway ?
 *
 * ── Ce que ce balayage voit et que son voisin ne peut pas voir ─────────────
 *
 * `account-keyed-rate-limit-sweep.ts` part du `keyGenerator` : il demande, à
 * toute config qui en déclare un lisant l'appelant, de poser le hook qui rend
 * cette lecture possible. C'est juste, et c'est aveugle à la faute inverse —
 * **une config qui ne déclare RIEN**. Un littéral nu n'a pas de
 * `keyGenerator`, donc il n'existe pas pour ce balayage-là ; il n'a pas de nom
 * non plus, donc aucune énumération de fabriques ne l'atteint. Deux en
 * vivaient (`routes/invitations.ts`, `routes/auth/revoke-all-sessions.ts`),
 * gardés par rien.
 *
 * Ce balayage part donc de la CONFIGURATION — de ce que la route déclare — et
 * non d'un nom de fonction.
 *
 * ── La règle ──────────────────────────────────────────────────────────────
 *
 * `mergeParams` d'@fastify/rate-limit est un `Object.assign`
 * (`index.js:190`) : toute clé absente d'une config de route est prise sur les
 * paramètres GLOBAUX — `keyGenerator: () => \`global:${ip}\``,
 * `skipOnError: true`, `hook: 'onRequest'`. Une config qui se tait ne choisit
 * donc rien ; elle hérite, en silence, d'un limiteur écrit pour une autre
 * question. Toute config de route doit :
 *
 *   • soit VENIR D'UN NOM — fabrique ou constante partagée, dont le site est
 *     lisible, relisable et gardé par le balayage voisin ;
 *   • soit DÉCLARER `hook` ET `keyGenerator` sur place — c'est-à-dire dire
 *     quand elle compte et ce qu'elle compte.
 *
 * `rateLimit: false` est une troisième forme, et c'en est bien une : la route
 * DÉSACTIVE le limiteur du plugin (`onRoute` ne fusionne alors rien) parce
 * qu'elle en monte un autre. Un refus explicite n'est pas un silence.
 *
 * ── Pourquoi la résolution des noms est BORNÉE ────────────────────────────
 *
 * Résoudre un nom, c'est chercher `hook` et `keyGenerator` dans un texte plus
 * large que la config elle-même : trop large, et n'importe quelle occurrence
 * voisine rendrait un littéral nu « conforme ». La résolution ne suit donc
 * que ce qui PORTE une valeur jusqu'à la config : les identifiants cités par
 * l'expression, les ÉPANDAGES (`...GARDES_DE_CLE`) et les enveloppes que ces
 * corps appellent à leur tour. Et une déclaration s'arrête à la suivante — la
 * garde `ne déborde pas sur la déclaration voisine` du témoin l'exige.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

export const RACINE_GATEWAY = join(__dirname, '..', '..', '..');

/** Ce que la route a écrit à droite de `rateLimit:`. */
export type FormeDeConfig = 'desactivee' | 'nommee' | 'litterale';

export type ConfigDeRoute = {
  readonly fichier: string;
  /**
   * `fichier#<résumé de l'expression>` — jamais un numéro de ligne, qui
   * périmerait au premier commit. Pour un littéral, le résumé est la LISTE de
   * ses propriétés : c'est exactement ce qui manque quand il est fautif.
   */
  readonly cle: string;
  readonly forme: FormeDeConfig;
  readonly expression: string;
  readonly declareHook: boolean;
  readonly declareKeyGenerator: boolean;
  readonly conforme: boolean;
};

const REPERTOIRES_IGNORES = new Set(['node_modules', '__tests__', 'dist', '__stubs__']);

export function listerSources(racine: string): string[] {
  const trouves: string[] = [];
  const descendre = (repertoire: string): void => {
    for (const entree of readdirSync(repertoire)) {
      const chemin = join(repertoire, entree);
      if (statSync(chemin).isDirectory()) {
        if (REPERTOIRES_IGNORES.has(entree) === false) descendre(chemin);
        continue;
      }
      if (entree.endsWith('.ts') && entree.endsWith('.d.ts') === false) trouves.push(chemin);
    }
  };
  descendre(racine);
  return trouves;
}

/**
 * Remplace commentaires et chaînes par des espaces SANS changer la longueur.
 *
 * Le masque sert à APPARIER (accolades, parenthèses, position d'une
 * propriété) ; il ne sert jamais à LIRE, puisqu'il efface `'preHandler'` et
 * le code d'un gabarit. Les tests de contenu lisent `masquerCommentaires`,
 * qui n'ôte que ce qui n'est pas du programme.
 */
export function masquerCommentairesEtChaines(source: string): string {
  return parcourir(source, true);
}

/** N'ôte que les commentaires : tout ce qui reste est du programme. */
export function masquerCommentaires(source: string): string {
  return parcourir(source, false);
}

function parcourir(source: string, effacerLesChaines: boolean): string {
  const sortie = source.split('');
  const n = source.length;
  let i = 0;
  const effacer = (position: number): void => {
    if (source[position] !== '\n') sortie[position] = ' ';
  };

  while (i < n) {
    if (source[i] === '/' && source[i + 1] === '/') {
      while (i < n && source[i] !== '\n') { effacer(i); i += 1; }
      continue;
    }
    if (source[i] === '/' && source[i + 1] === '*') {
      while (i < n && (source[i] !== '*' || source[i + 1] !== '/')) { effacer(i); i += 1; }
      effacer(i); effacer(i + 1); i += 2;
      continue;
    }
    if (source[i] === '"' || source[i] === "'" || source[i] === '`') {
      const guillemet = source[i];
      if (effacerLesChaines) effacer(i);
      i += 1;
      while (i < n) {
        if (source[i] === '\\') {
          if (effacerLesChaines) { effacer(i); effacer(i + 1); }
          i += 2;
          continue;
        }
        if (source[i] === guillemet) {
          if (effacerLesChaines) effacer(i);
          i += 1;
          break;
        }
        if (effacerLesChaines) effacer(i);
        i += 1;
      }
      continue;
    }
    i += 1;
  }
  return sortie.join('');
}

const OUVRANTS: Record<string, string> = { '{': '}', '(': ')', '[': ']' };
const FERMANTS = new Set(['}', ')', ']']);

/** Fin de la valeur qui commence en `debut`, dans un objet ou une liste. */
function finDeLExpression(masquee: string, debut: number): number {
  let profondeur = 0;
  for (let i = debut; i < masquee.length; i += 1) {
    const c = masquee[i];
    if (OUVRANTS[c] !== undefined) profondeur += 1;
    else if (FERMANTS.has(c)) {
      if (profondeur === 0) return i;
      profondeur -= 1;
    } else if (c === ',' && profondeur === 0) return i;
  }
  return masquee.length;
}

const MOTS_DE_DECLARATION = '(?:export\\s+)?(?:default\\s+)?(?:async\\s+)?(?:const|let|var|function|class|type|interface)';

/**
 * Texte d'une déclaration de même fichier, de son mot-clé jusqu'à la
 * déclaration SUIVANTE.
 *
 * S'arrêter au premier groupe d'accacolades équilibré serait faux : une
 * fonction dont le type de retour est un objet (`createPreferenceRateLimitConfig`)
 * rendrait alors son ANNOTATION et pas son corps. Et ne pas s'arrêter du tout
 * ferait passer pour conforme un littéral nu suivi d'une fabrique correcte.
 */
function texteDeLaDeclaration(masquee: string, lisible: string, nom: string): string {
  const declaration = new RegExp(`(?:^|\\n)\\s*${MOTS_DE_DECLARATION}\\s+${nom}\\b`).exec(masquee);
  if (declaration === null) return '';

  const debut = declaration.index;
  return lisible.slice(debut, finDeLaDeclaration(masquee, debut + declaration[0].length));
}

/**
 * Fin d'une déclaration : la déclaration SUIVANTE de même niveau.
 *
 * La profondeur d'accolades est indispensable dans les deux sens. Sans elle,
 * la déclaration s'étend jusqu'à la fin du fichier et un littéral nu se fait
 * absoudre par la fabrique correcte écrite en dessous. Avec un simple « ligne
 * qui commence par `const` », elle s'arrête au premier `const` INTERNE — et
 * `createSoundRouteRateLimitConfig`, dont le corps ouvre sur deux `const`
 * avant son `return`, perdrait l'objet qu'elle rend.
 */
function finDeLaDeclaration(masquee: string, apres: number): number {
  const suivante = new RegExp(`\\n[ \\t]*${MOTS_DE_DECLARATION}\\s`, 'g');
  suivante.lastIndex = apres;

  let profondeur = 0;
  let curseur = apres;
  for (let trouvee = suivante.exec(masquee); trouvee !== null; trouvee = suivante.exec(masquee)) {
    for (; curseur < trouvee.index; curseur += 1) {
      if (masquee[curseur] === '{') profondeur += 1;
      else if (masquee[curseur] === '}') profondeur -= 1;
    }
    if (profondeur <= 0) return trouvee.index;
  }
  return masquee.length;
}

const IDENTIFIANT = /[A-Za-z_$][\w$]*/g;
const EPANDAGE = /\.\.\.\s*([A-Za-z_$][\w$]*)/g;
const DECLARE_HOOK = /\bhook\s*:/;
const DECLARE_KEY_GENERATOR = /\bkeyGenerator\b/;

type Index = ReadonlyMap<string, readonly { fichier: string; texte: string }[]>;

function resoudre(
  index: Index,
  fichier: string,
  noms: readonly string[],
  vus: Set<string>,
  profondeur: number
): string[] {
  if (profondeur === 0) return [];
  const textes: string[] = [];

  for (const nom of noms) {
    if (vus.has(nom)) continue;
    vus.add(nom);

    const definitions = index.get(nom);
    if (definitions === undefined) continue;
    const retenues = definitions.some((d) => d.fichier === fichier)
      ? definitions.filter((d) => d.fichier === fichier)
      : definitions;

    for (const definition of retenues) {
      textes.push(definition.texte);
      const enveloppes = Array.from(definition.texte.matchAll(EPANDAGE)).map((m) => m[1]);
      const appelees = Array.from(definition.texte.matchAll(/return\s+([A-Za-z_$][\w$]*)\s*\(/g))
        .map((m) => m[1]);
      textes.push(
        ...resoudre(index, definition.fichier, [...enveloppes, ...appelees], vus, profondeur - 1)
      );
    }
  }

  return textes;
}

function resumeDuLitteral(litteral: string): string {
  const proprietes = Array.from(litteral.matchAll(/(?:^|[{,]\s*)([A-Za-z_$][\w$]*)\s*:/g))
    .map((m) => m[1]);
  return `{${Array.from(new Set(proprietes)).join(',')}}`;
}

export type Releve = {
  readonly configs: readonly ConfigDeRoute[];
  readonly occurrences: number;
};

export function relever(
  fichier: string,
  source: string,
  racine: string,
  index: Index
): Releve {
  const pourApparier = masquerCommentairesEtChaines(source);
  const lisible = masquerCommentaires(source);
  const chemin = relative(racine, fichier).split(sep).join('/');
  const configs: ConfigDeRoute[] = [];
  let occurrences = 0;

  for (const occurrence of pourApparier.matchAll(/\brateLimit\s*:/g)) {
    occurrences += 1;
    const debut = occurrence.index + occurrence[0].length;
    const decalage = pourApparier.slice(debut).search(/\S/);
    if (decalage < 0) continue;

    const depart = debut + decalage;
    const fin = finDeLExpression(pourApparier, depart);
    const expression = lisible.slice(depart, fin).trim();
    const pourLire = pourApparier.slice(depart, fin);

    const forme: FormeDeConfig = /^false\b/.test(expression)
      ? 'desactivee'
      : pourLire.trimStart().startsWith('{')
        ? 'litterale'
        : 'nommee';

    const noms = forme === 'litterale'
      ? Array.from(expression.matchAll(EPANDAGE)).map((m) => m[1])
      : Array.from(pourLire.matchAll(IDENTIFIANT)).map((m) => m[0]);

    const textes = [expression, ...resoudre(index, chemin, noms, new Set(), 3)];
    const porte = (motif: RegExp): boolean => textes.some((texte) => motif.test(texte));

    const declareHook = forme === 'desactivee' || porte(DECLARE_HOOK);
    const declareKeyGenerator = forme === 'desactivee' || porte(DECLARE_KEY_GENERATOR);

    const resume = forme === 'desactivee'
      ? 'false'
      : forme === 'litterale'
        ? resumeDuLitteral(expression)
        : expression.replace(/\s+/g, ' ');

    configs.push({
      fichier: chemin,
      cle: `${chemin}#${resume}`,
      forme,
      expression,
      declareHook,
      declareKeyGenerator,
      conforme: declareHook && declareKeyGenerator,
    });
  }

  return { configs, occurrences };
}

export function indexerDeclarations(
  sources: readonly string[],
  racine: string
): Index {
  const index = new Map<string, { fichier: string; texte: string }[]>();

  for (const fichier of sources) {
    const source = readFileSync(fichier, 'utf8');
    const masquee = masquerCommentairesEtChaines(source);
    const lisible = masquerCommentaires(source);
    const chemin = relative(racine, fichier).split(sep).join('/');

    for (const declaration of masquee.matchAll(
      new RegExp(`(?:^|\\n)\\s*${MOTS_DE_DECLARATION}\\s+([A-Za-z_$][\\w$]*)\\b`, 'g')
    )) {
      const nom = declaration[1];
      const texte = texteDeLaDeclaration(masquee, lisible, nom);
      if (texte === '') continue;
      const deja = index.get(nom) ?? [];
      if (deja.some((d) => d.fichier === chemin)) continue;
      index.set(nom, [...deja, { fichier: chemin, texte }]);
    }
  }

  return index;
}

export type ResultatBalayage = {
  readonly fichiersVisites: number;
  readonly occurrences: number;
  readonly configs: readonly ConfigDeRoute[];
};

export function balayerConfigsDeRoute(racine: string = RACINE_GATEWAY): ResultatBalayage {
  const sources = listerSources(racine);
  const index = indexerDeclarations(sources, racine);

  let occurrences = 0;
  const configs: ConfigDeRoute[] = [];
  for (const fichier of sources) {
    const releve = relever(fichier, readFileSync(fichier, 'utf8'), racine, index);
    occurrences += releve.occurrences;
    configs.push(...releve.configs);
  }

  return { fichiersVisites: sources.length, occurrences, configs };
}

/** Relève une source ISOLÉE — pour les témoins de mutation du cliquet. */
export function releverSourceIsolee(source: string): readonly ConfigDeRoute[] {
  const index = new Map<string, { fichier: string; texte: string }[]>();
  const masquee = masquerCommentairesEtChaines(source);
  const lisible = masquerCommentaires(source);
  for (const declaration of masquee.matchAll(
    new RegExp(`(?:^|\\n)\\s*${MOTS_DE_DECLARATION}\\s+([A-Za-z_$][\\w$]*)\\b`, 'g')
  )) {
    const nom = declaration[1];
    const texte = texteDeLaDeclaration(masquee, lisible, nom);
    if (texte !== '') index.set(nom, [{ fichier: 'isolee.ts', texte }]);
  }
  return relever('/x/src/isolee.ts', source, '/x/src', index).configs;
}
