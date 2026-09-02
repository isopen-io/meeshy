// La LECTURE des workflows GitHub Actions dont le garde de l'ordre de
// construction a besoin [#4761].
//
// POURQUOI CE MODULE EXISTE
//
// `scripts/check-ci-build-order.mjs` tient les INVARIANTS ; ce fichier tient la
// façon de les MESURER sur un fichier de workflow. La séparation n'est pas
// esthétique : le garde atteignait 1 112 lignes, c'est-à-dire au-delà du budget
// de 1 100 (`CLAUDE.md` § Code Style), et « on extrait d'abord, on ajoute
// ensuite ». Même partage, et pour la même raison, que
// `scripts/lib/v3-disque.mjs` face à `scripts/check-v3-pipeline.mjs`.
//
// Ce que le module rend est de la DONNÉE — des jobs, des étapes ordonnées, des
// contextes de matrice, des commandes shell avec leur répertoire courant.
// Aucune loi n'est écrite ici.
//
// POURQUOI PAS DE BIBLIOTHÈQUE YAML
//
// Mesuré avant d'importer quoi que ce soit : `node -e "require('js-yaml')"` et
// `node -e "require('yaml')"` rendent tous deux MODULE_NOT_FOUND à la racine du
// dépôt — aucune des deux n'est une dépendance de la racine, et le job `quality`
// lance ce garde AVANT tout `install` de workspace. Les quatre gardes voisins de
// la racine font le même choix pour la même raison.
//
// Cette lecture a été CONFRONTÉE à un vrai analyseur avant d'être crue :
// `PyYAML` et ce fichier rendent les MÊMES 41 jobs et les MÊMES 332 étapes sur
// les seize workflows du dépôt, fichier par fichier, sans un écart (mesuré le
// 2026-09-02). Une lecture à la main qui compterait MOINS que l'analyseur serait
// un garde aveugle sur tout ce qu'elle rate, et silencieusement vert — d'où,
// en plus, les planchers de non-vacuité que le garde tient de son côté.

// --- lecture du peu de YAML dont ce garde a besoin ---------------------------

export const indentOf = (line) => {
  const first = line.search(/\S/);
  return first === -1 ? null : first;
};

/** Les lignes du bloc qui suit `line`, c'est-à-dire tout ce qui est plus indenté. */
export const blockAfter = (lines, start) => {
  const base = indentOf(lines[start]);
  const collected = [];
  for (let index = start + 1; index < lines.length; index += 1) {
    const indent = indentOf(lines[index]);
    if (indent !== null && indent <= base) break;
    collected.push({ number: index + 1, text: lines[index] });
  }
  return collected;
};

// Le dépouillement des guillemets ne vaut que pour un scalaire ENTIÈREMENT
// entouré : `if: env.PACKAGE_MANAGER == 'bun'` n'est pas une chaîne citée, et un
// `replace` naïf en ferait `== 'bun`, c'est-à-dire une expression intokenisable.
export const unquote = (value) => {
  const quoted = /^'([^']*)'$/.exec(value) ?? /^"([^"]*)"$/.exec(value);
  return quoted === null ? value : quoted[1];
};

export const scalarAfter = (text) => unquote(text.slice(text.indexOf(':') + 1).trim());

/** `key: |` ou `key: >` suivi d'un bloc, ou `key: valeur` sur une ligne. */
export const blockScalar = (lines, start) => {
  const inline = scalarAfter(lines[start].text ?? lines[start]);
  if (inline !== '' && inline !== '|' && inline !== '>' && inline !== '|-' && inline !== '>-') {
    return inline;
  }
  const body = blockAfter(
    lines.map((entry) => entry.text ?? entry),
    start,
  );
  const filled = body.filter((entry) => entry.text.trim() !== '');
  if (filled.length === 0) return '';
  const margin = Math.min(...filled.map((entry) => indentOf(entry.text)));
  return body.map((entry) => entry.text.slice(margin)).join('\n');
};

/** Les jobs de `ci.yml` : `jobs:` en colonne 0, un nom de job par indentation 2. */
export const jobsOf = (workflow) => {
  const lines = workflow.split('\n');
  const start = lines.findIndex((line) => /^jobs:\s*$/.test(line));
  if (start === -1) return [];
  const body = blockAfter(lines, start);
  const jobs = [];
  body.forEach((entry, position) => {
    const header = /^ {2}([A-Za-z0-9_-]+):\s*$/.exec(entry.text);
    if (!header) return;
    const rest = body.slice(position + 1);
    const end = rest.findIndex((next) => indentOf(next.text) !== null && indentOf(next.text) <= 2);
    jobs.push({
      name: header[1],
      line: entry.number,
      body: (end === -1 ? rest : rest.slice(0, end)),
    });
  });
  return jobs;
};

/** Les étapes d'un job, DANS L'ORDRE — c'est l'ordre qui porte l'invariant. */
export const stepsOf = (job) => {
  const texts = job.body.map((entry) => entry.text);
  const stepsStart = texts.findIndex((text) => /^ {4}steps:\s*$/.test(text));
  if (stepsStart === -1) return [];
  const steps = [];
  let current = null;
  for (let index = stepsStart + 1; index < job.body.length; index += 1) {
    const { number, text } = job.body[index];
    const indent = indentOf(text);
    if (indent !== null && indent <= 4 && text.trim() !== '') break;
    if (/^ {6}- /.test(text)) {
      if (current) steps.push(current);
      current = { line: number, lines: [] };
    }
    if (!current) continue;
    current.lines.push({ number, text: text.replace(/^( {6})- /, '$1  ') });
  }
  if (current) steps.push(current);
  return steps.map((step) => {
    const texts2 = step.lines.map((entry) => entry.text);
    const field = (key) => texts2.findIndex((text) => new RegExp(`^ {8}${key}:`).test(text));
    const nameAt = field('name');
    const runAt = field('run');
    const ifAt = field('if');
    const usesAt = field('uses');
    const dirAt = field('working-directory');
    return {
      line: step.line,
      name: nameAt === -1 ? '(étape sans nom)' : scalarAfter(texts2[nameAt]),
      uses: usesAt === -1 ? null : scalarAfter(texts2[usesAt]),
      condition: ifAt === -1 ? null : blockScalar(step.lines, ifAt),
      run: runAt === -1 ? null : blockScalar(step.lines, runAt),
      workingDirectory: dirAt === -1 ? null : scalarAfter(texts2[dirAt]),
    };
  });
};

/**
 * `strategy.matrix` développée en contextes. Sans elle, le job `test` — le plus
 * gros du fichier, cinq paquets — resterait illisible (`cd ${{ matrix.package.path }}`)
 * et le garde s'y croirait vert en n'y ayant rien vu.
 */
export const matrixContextsOf = (job) => {
  const texts = job.body.map((entry) => entry.text);
  const at = texts.findIndex((text) => /^ {6}matrix:\s*$/.test(text));
  if (at === -1) return [{}];
  const block = blockAfter(texts, at);
  const dimensions = [];
  block.forEach((entry, position) => {
    const key = /^ {8}([A-Za-z0-9_-]+):\s*$/.exec(entry.text);
    if (!key) return;
    const rest = block.slice(position + 1);
    const end = rest.findIndex((next) => indentOf(next.text) !== null && indentOf(next.text) <= 8);
    const items = [];
    (end === -1 ? rest : rest.slice(0, end)).forEach((line) => {
      const head = /^ {10}- ([A-Za-z0-9_-]+):\s*(.*)$/.exec(line.text);
      if (head) {
        items.push({ [head[1]]: head[2].replace(/^['"]|['"]$/g, '') });
        return;
      }
      const scalar = /^ {10}- (.+)$/.exec(line.text);
      if (scalar) {
        items.push(scalar[1].replace(/^['"]|['"]$/g, ''));
        return;
      }
      const pair = /^ {12}([A-Za-z0-9_-]+):\s*(.*)$/.exec(line.text);
      if (pair && items.length > 0 && typeof items[items.length - 1] === 'object') {
        items[items.length - 1][pair[1]] = pair[2].replace(/^['"]|['"]$/g, '');
      }
    });
    if (items.length > 0) dimensions.push([key[1], items]);
  });
  return dimensions.reduce(
    (contexts, [key, items]) =>
      contexts.flatMap((context) => items.map((item) => ({ ...context, [key]: item }))),
    [{}],
  );
};

/** Les valeurs d'une liste `options:` — la déclaration des scénarios. */
export const optionsUnder = (workflow, key) => {
  const lines = workflow.split('\n');
  const at = lines.findIndex((line) => new RegExp(`^\\s{6}${key}:\\s*$`).test(line));
  if (at === -1) return [];
  return blockAfter(lines, at)
    .flatMap((entry) => {
      const item = /^\s*- (.+)$/.exec(entry.text);
      return item ? [item[1].replace(/^['"]|['"]$/g, '')] : [];
    });
};

// --- évaluation des expressions `${{ … }}` -----------------------------------

// Une valeur OPAQUE : la forme de l'expression a été comprise, sa valeur ne
// l'est pas (un secret, un `hashFiles`, un `needs.*.result`). Elle se substitue
// par un jeton qui ne peut ressembler ni à un répertoire ni à une commande, si
// bien qu'une étape qui en dépend n'est jamais lue de travers.
export const OPAQUE = Symbol('opaque');

const ROOTS_RESOLUS = new Set(['env', 'matrix']);
const ROOTS_CONNUS = new Set([
  'env', 'matrix', 'github', 'secrets', 'vars', 'runner', 'needs', 'inputs', 'steps', 'job', 'strategy',
]);

export class ExpressionInconnue extends Error {}

export const tokenize = (expression) => {
  const tokens = [];
  let index = 0;
  while (index < expression.length) {
    const rest = expression.slice(index);
    const space = /^\s+/.exec(rest);
    if (space) { index += space[0].length; continue; }
    const literal = /^'((?:[^']|'')*)'/.exec(rest);
    if (literal) { tokens.push({ kind: 'literal', value: literal[1].replace(/''/g, "'") }); index += literal[0].length; continue; }
    const operator = /^(==|!=|&&|\|\||\(|\)|,|!)/.exec(rest);
    if (operator) { tokens.push({ kind: operator[1] }); index += operator[0].length; continue; }
    const path = /^[A-Za-z_][A-Za-z0-9_.-]*(\[[^\]]*\])?/.exec(rest);
    if (path) { tokens.push({ kind: 'path', value: path[0] }); index += path[0].length; continue; }
    const number = /^[0-9]+/.exec(rest);
    if (number) { tokens.push({ kind: 'literal', value: number[0] }); index += number[0].length; continue; }
    throw new ExpressionInconnue(`caractère « ${rest[0]} » inattendu dans « ${expression} »`);
  }
  return tokens;
};

export const resolvePath = (path, context) => {
  const [root, ...rest] = path.split('.');
  if (!ROOTS_CONNUS.has(root)) {
    if (path === 'true') return true;
    if (path === 'false') return false;
    throw new ExpressionInconnue(`racine « ${root} » inconnue`);
  }
  if (!ROOTS_RESOLUS.has(root)) return OPAQUE;
  const value = rest.reduce(
    (current, segment) => (current && typeof current === 'object' ? current[segment] : undefined),
    context[root] ?? {},
  );
  return value === undefined ? '' : value;
};

/** Descente récursive sur `||` > `&&` > `==`/`!=` > primaire. */
export const parseExpression = (tokens, context) => {
  const primary = () => {
    const token = tokens.shift();
    if (token === undefined) throw new ExpressionInconnue('expression tronquée');
    if (token.kind === 'literal') return token.value;
    if (token.kind === '!') { const inner = primary(); return inner === OPAQUE ? OPAQUE : !inner; }
    if (token.kind === '(') { const inner = orExpression(); if (tokens.shift()?.kind !== ')') throw new ExpressionInconnue('parenthèse non fermée'); return inner; }
    if (token.kind !== 'path') throw new ExpressionInconnue(`jeton « ${token.kind} » inattendu`);
    if (tokens[0]?.kind === '(') {
      tokens.shift();
      let depth = 1;
      while (depth > 0) {
        const next = tokens.shift();
        if (next === undefined) throw new ExpressionInconnue('appel de fonction non fermé');
        if (next.kind === '(') depth += 1;
        if (next.kind === ')') depth -= 1;
      }
      return OPAQUE;
    }
    return resolvePath(token.value, context);
  };
  const comparison = () => {
    let left = primary();
    while (tokens[0]?.kind === '==' || tokens[0]?.kind === '!=') {
      const operator = tokens.shift().kind;
      const right = primary();
      if (left === OPAQUE || right === OPAQUE) { left = OPAQUE; continue; }
      left = operator === '==' ? left === right : left !== right;
    }
    return left;
  };
  const andExpression = () => {
    let left = comparison();
    while (tokens[0]?.kind === '&&') {
      tokens.shift();
      const right = comparison();
      if (left === OPAQUE) { left = OPAQUE; continue; }
      left = left === false || left === '' ? left : right;
    }
    return left;
  };
  const orExpression = () => {
    let left = andExpression();
    while (tokens[0]?.kind === '||') {
      tokens.shift();
      const right = andExpression();
      if (left === OPAQUE) { left = OPAQUE; continue; }
      left = left === false || left === '' ? right : left;
    }
    return left;
  };
  const value = orExpression();
  if (tokens.length > 0) throw new ExpressionInconnue(`reste « ${tokens[0].value ?? tokens[0].kind} »`);
  return value;
};

export const evaluate = (expression, context) => parseExpression(tokenize(expression), context);

const EXPRESSION = /\$\{\{([^}]*)\}\}/g;

/** Substitue toutes les expressions d'un texte. Lève si l'une n'est pas comprise. */
export const render = (text, context) =>
  text.replace(EXPRESSION, (_, body) => {
    const value = evaluate(body.trim(), context);
    if (value === OPAQUE) return '<opaque>';
    if (value === true) return 'true';
    if (value === false) return 'false';
    return String(value);
  });

/**
 * Un `if:` absent ⇒ l'étape tourne. Un `if:` opaque ⇒ elle PEUT tourner, et le
 * garde la compte comme tournant : refuser de la voir laisserait un trou.
 * La valeur d'un `if:` est une EXPRESSION, avec ou sans `${{ }}` autour.
 */
export const stepRuns = (condition, context) => {
  if (condition === null) return true;
  const naked = /^\$\{\{([\s\S]*)\}\}$/.exec(condition.trim());
  const value = evaluate((naked === null ? condition : naked[1]).trim(), context);
  return value === OPAQUE ? true : value !== false && value !== '';
};

// --- déroulement du script rendu comme un shell minimal ----------------------

// Le binaire invoqué → le gestionnaire qu'il faut avoir INSTALLÉ. `bunx` est
// dans la table parce qu'il exige `bun` autant que `bun` lui-même : mesuré, une
// seule occurrence dans le dépôt (`release.yml:168`, `bunx changeset version`),
// et elle est bien précédée de son `oven-sh/setup-bun`. `npx` n'y est pas — il
// vient avec Node, que tous les jobs concernés installent.
const GESTIONNAIRES = new Map([
  ['bun', 'bun'],
  ['bunx', 'bun'],
  ['pnpm', 'pnpm'],
  ['npm', 'npm'],
  ['yarn', 'yarn'],
]);

// Les mots-clés qui OUVRENT, ALTERNENT et FERMENT une branche de shell. Le
// script du job `test` en contient une (`if [ … ] ; then cd … ; else … ; fi`),
// et un `cd` pris dans une branche ne vaut QUE pour cette branche : le lire à
// plat attribuerait la commande de la branche `else` — qui tourne à la RACINE,
// donc sous turbo — au répertoire où l'autre branche était entrée.
const OUVRE_BRANCHE = /^(if|case)\b/;
const ALTERNE_BRANCHE = /^(else|elif|;;|\S+\))/;
const FERME_BRANCHE = /^(fi|esac)\b/;

/**
 * Les commandes d'un script, chacune avec le RÉPERTOIRE où elle s'exécute.
 * Le `cd` est suivi ; c'est lui, et lui seul, qui fait sortir une commande du
 * graphe de turbo : depuis la racine, `bun run build` EST `turbo run build`.
 *
 * `indetermine` marque un script dont l'ordre de construction n'est PAS lisible
 * — un `cd` pris dans une branche, suivi d'une commande APRÈS la fermeture de
 * cette branche : le répertoire y dépend de la branche prise à l'exécution.
 * Mesuré : zéro cas dans `ci.yml` au 2026-09-02. Le garde le refuse plutôt que
 * de deviner, parce qu'une devinette y serait indiscernable d'une lecture.
 */
export const commandsOf = (script, startDirectory) => {
  let directory = startDirectory;
  const commands = [];
  const entered = [];
  let branchChangedDirectory = false;
  let indetermine = false;
  for (const rawLine of script.split('\n')) {
    const line = rawLine.replace(/#.*$/, '').trim();
    if (line === '') continue;
    for (const piece of line.split(/&&|\|\||;/)) {
      const command = piece.trim().replace(/^(?:then|do)\s+/, '');
      if (command === '') continue;
      if (/^(then|do)$/.test(command)) continue;
      if (OUVRE_BRANCHE.test(command)) { entered.push(directory); continue; }
      if (entered.length > 0 && ALTERNE_BRANCHE.test(command)) {
        directory = entered[entered.length - 1];
        continue;
      }
      if (FERME_BRANCHE.test(command)) {
        directory = entered.pop() ?? directory;
        if (entered.length === 0 && branchChangedDirectory) indetermine = true;
        continue;
      }
      const cd = /^cd\s+(\S+)/.exec(command);
      if (cd) {
        directory = normalise(directory, cd[1]);
        if (entered.length > 0) branchChangedDirectory = true;
        continue;
      }
      if (indetermine && scriptRun(command) !== null) {
        return { commands, indetermine: true };
      }
      commands.push({ directory, command });
    }
  }
  return { commands, indetermine: false };
};

export const normalise = (base, target) => {
  if (target.startsWith('/')) return target;
  const segments = [...(base === '' ? [] : base.split('/')), ...target.split('/')];
  return segments
    .reduce((stack, segment) => {
      if (segment === '.' || segment === '') return stack;
      if (segment !== '..') return [...stack, segment];
      return stack.length === 0 ? stack : stack.slice(0, -1);
    }, [])
    .join('/');
};

/** `bun run build`, `pnpm run build`, `npm run test -- …` — le `run` est exigé. */
export const scriptRun = (command) => {
  const match = /^(bun|pnpm|npm|yarn)\s+run\s+([A-Za-z0-9:_-]+)/.exec(command);
  return match === null ? null : { manager: match[1], script: match[2] };
};

export const managerInvoked = (command) => {
  const match = /^([A-Za-z0-9_-]+)/.exec(command);
  return match === null ? null : GESTIONNAIRES.get(match[1]) ?? null;
};
