#!/usr/bin/env node
/**
 * LE TÉMOIN DES CLASSES UTILITAIRES — celui qui manquait au renommage.
 *
 * Une classe Tailwind qui ne correspond à AUCUN jeton n'est pas une erreur :
 * c'est un silence. Le compilateur n'émet simplement pas de règle, le
 * navigateur ignore la classe, et l'élément se peint avec les valeurs par
 * défaut. Rien ne rougit — ni `tsc`, ni le build, ni les tests. C'est
 * exactement le défaut qu'un renommage de jetons fabrique en série : une seule
 * classe oubliée (`text-corps` là où la table dit désormais `text-body`) rend
 * un texte à la mauvaise taille sur un écran que personne ne regarde ce
 * jour-là.
 *
 * LA MÉTHODE, et pourquoi c'est celle-là : on n'oppose PAS les classes du
 * source à une liste de jetons déclarés — il faudrait alors tenir à la main la
 * liste des utilitaires natifs de Tailwind, qui dérive à chaque version. On les
 * oppose à la FEUILLE PRODUITE. Tailwind n'émet une règle que pour ce qu'il a
 * reconnu : une classe absente du CSS construit est une classe morte, quelle
 * qu'en soit la raison — jeton renommé, faute de frappe, utilitaire retiré.
 * Le gate lit donc la sortie, pas la configuration.
 *
 * PAR FEUILLE, PAS EN BLOC (revue de #5606, défaut 2) — la première version
 * concaténait les DEUX feuilles produites (`index-*.css`, l'application ;
 * `institutional-*.css`, les cinq pages précachées — deux entrées CSS
 * DISTINCTES et STABLES, `vite.config.ts` § `rollupOptions.input`) avant de
 * comparer. `text-body`, `text-secondary`, `text-screen`, `text-thread` et
 * `text-brand` sont morts dans `institutional-*.css` (son `@theme` ne les
 * déclarait pas) et vivants dans `index-*.css` (celui de l'application) : la
 * concaténation faisait gagner le second, et ce gate rendait vert un texte
 * institutionnel rendu à la taille du corps sur les cinq pages. Chaque groupe
 * de sources est donc comparé à SA SEULE feuille — `src/institutional/**` à
 * `institutional-*.css`, le reste de `src/` à `index-*.css` — et un fichier
 * qui n'appartient à aucun groupe connu fait échouer le gate plutôt que de se
 * ranger en silence dans l'un ou l'autre.
 *
 * UNE RÈGLE QUELCONQUE N'EST PAS UNE RÈGLE SUFFISANTE (revue de #5606, défaut
 * 1) — « la classe a une règle » ne dit pas « la règle fait ce que son jeton
 * promet ». Quand un rôle de COULEUR (`--color-<role>`) et un rôle de TAILLE
 * (`--text-<role>`) portent le MÊME nom, Tailwind ne peut émettre qu'UNE seule
 * résolution pour l'utilitaire `text-<role>` — mesuré : la couleur gagne
 * TOUJOURS, et la règle de `font-size` que `--text-<role>` promettait
 * disparaît sans qu'aucune classe ne devienne « morte » au sens du gate
 * ci-dessus (`.text-meta{color:...}` EXISTE bel et bien dans la feuille). Le
 * premier gate ne voyait donc pas `text-meta` perdre sa taille : il vérifiait
 * « une règle existe-t-elle ? », jamais « la règle porte-t-elle le style que
 * SON PROPRE jeton déclare ? ». `sizelessTextClasses` lit les rôles de taille
 * déclarés par le thème de CHAQUE groupe et exige que la règle compilée de
 * `text-<rôle>` contienne `font-size` — sinon le rôle est SILENCIEUSEMENT
 * réduit à sa seule couleur, exactement le défaut qui a échappé au premier
 * passage de ce gate sur les cinq pages institutionnelles.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const DIST = join(ROOT, 'dist');

/**
 * Les classes que la feuille ne peut pas porter, et qui ne sont pas mortes
 * pour autant. Chaque entrée dit POURQUOI — une liste d'exceptions sans motif
 * redevient un tapis sous lequel on pousse les vraies.
 */
export const ALLOWED = new Map([
  ['group', 'marqueur de variante Tailwind : aucune règle propre'],
  ['peer', 'idem'],
  ['sr-only', 'émis seulement quand employé ; conservé comme utilitaire natif'],
  ['lens-row', 'crochet de sélection de la scène et du témoin — aucun style attendu'],
  ['lens-extra', 'idem : ce que la scène montre ou cache par style inline'],
  [
    'avatar-root',
    'crochet de sélection du témoin de contraste (#5559 revue-correction, ' +
      'défauts 1/8 — `check-list-actions.mjs`) : le fondu de sourdine vit en ' +
      'style INLINE (`opacity`, prop `Avatar`), jamais dans la feuille',
  ],
]);

export const sourceFiles = (dir) =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = join(dir, e.name);
    if (e.isDirectory()) return sourceFiles(p);
    return /\.(tsx|ts)$/.test(e.name) ? [p] : [];
  });

/**
 * Le texte d'un fichier, COMMENTAIRES ÔTÉS.
 *
 * Sans ce dépouillement, un `className=` cité en PROSE est extrait comme s'il
 * était du code — et sa chaîne, non refermée sur la ligne, court jusqu'au
 * guillemet suivant en emportant l'astérisque du doc-comment. C'est ce qui a
 * fait rougir `dev` le 2026-09-10 : `thread-chrome.ts` documente le chrome du
 * fil par « le `<div className="flex …` », et le garde réclamait une règle pour
 * une classe nommée `*`.
 *
 * > **Un garde de source qui ne dépouille pas les commentaires accuse la prose
 * > qui l'explique.** Le dépôt le sait ailleurs — `AppSourceGuard.stripComments`
 * > côté Swift, et les deux témoins de parité de `apps/web-v3` — ce site-ci
 * > l'ignorait.
 *
 * L'ordre compte : les blocs d'abord, sinon un `//` À L'INTÉRIEUR d'un bloc
 * (une URL, un chemin) couperait la ligne et laisserait la fin du bloc en
 * pâture au balayage.
 */
const sansCommentaires = (source) =>
  source
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    /* Uniquement les lignes ENTIÈREMENT commentées. Couper à partir d'un `//`
       trouvé n'importe où retirerait la fin d'une ligne de CODE — et un `//`
       vit aussi dans `https://`. Un garde qui cesse de voir des classes passe
       au vert sans rien mesurer : c'est la direction d'erreur à ne pas
       prendre. */
    .replace(/^\s*\/\/[^\n]*$/gm, ' ');

/** Les classes écrites dans les fichiers donnés, variantes ôtées. */
export const usedClasses = (files) => {
  const found = new Map();
  for (const file of files) {
    const text = sansCommentaires(readFileSync(file, 'utf8'));
    for (const m of text.matchAll(/className=(?:"([^"]*)"|\{`([^`]*)`\}|\{'([^']*)'\})/g)) {
      const raw = (m[1] ?? m[2] ?? m[3]).replace(/\$\{[^}]*\}/g, ' ');
      for (const token of raw.split(/\s+/).filter(Boolean)) {
        // Le sélecteur émis porte la VARIANTE : `placeholder:text-ios-ink-3`
        // devient `.placeholder\\:text-ios-ink-3::placeholder`, et la forme nue
        // n'existe nulle part. On cherche donc le jeton ENTIER, pas sa racine —
        // la première version de ce gate a signalé deux classes parfaitement
        // vivantes pour avoir coupé au premier `:`.
        if (token.startsWith('[')) continue;
        if (!found.has(token)) found.set(token, `${file}`);
      }
    }
  }
  return found;
};

export const escapeForCss = (name) => name.replace(/[.[\]/%#(),!:]/g, (c) => `\\${c}`);

/** Le corps `{ ... }` de la règle `.name{...}` dans `css`, ou `null` si absente. */
export const findRuleBody = (css, name) => {
  const m = css.match(new RegExp(`\\.${escapeForCss(name)}\\{([^}]*)\\}`));
  return m ? m[1] : null;
};

/**
 * Les rôles de taille déclarés par une source de thème — les noms qui suivent
 * `--text-` dans un bloc `@theme`. Lit le TEXTE source (pas la feuille
 * produite) : c'est là que le rôle est NOMMÉ, avant toute résolution.
 */
export const textSizeRoles = (themeSource) => {
  const roles = new Set();
  for (const m of themeSource.matchAll(/--text-([a-z0-9-]+)\s*:/g)) roles.add(m[1]);
  return roles;
};

/**
 * Les classes `text-<rôle>` employées dont le thème du groupe déclare un
 * `--text-<rôle>` (une promesse de TAILLE), mais dont la règle compilée ne
 * porte aucun `font-size` — collision de nom avec un `--color-<rôle>` qui a
 * gagné la résolution Tailwind. Une classe absente de la feuille (déjà
 * couverte par `dead`) n'est PAS redemandée ici.
 */
export const sizelessTextClasses = (used, css, sizeRoles) => {
  const findings = [];
  for (const [name, file] of used) {
    const m = /^text-([a-z0-9-]+)$/.exec(name);
    if (!m || !sizeRoles.has(m[1])) continue;
    const body = findRuleBody(css, name);
    if (body === null) continue; // classe morte : déjà signalée par `dead`
    if (!body.includes('font-size')) findings.push({ name, file });
  }
  return findings;
};

const runCli = () => {
  /**
   * LES DEUX GROUPES, chacun sa feuille et son THÈME — voir le doc-comment
   * ci-dessus. `INSTITUTIONAL_DIR` capture tout `src/institutional/**` ; le
   * reste de `src/` (toute l'application) va au groupe `app`. Un fichier
   * `.ts`/`.tsx` hors de `src/` ne serait rangé dans AUCUN des deux — il n'y
   * en a aucun aujourd'hui (`sourceFiles` part de `src/` seul).
   */
  const INSTITUTIONAL_DIR = join(ROOT, 'src/institutional');
  const allFiles = sourceFiles(join(ROOT, 'src'));
  const STYLES = join(ROOT, 'src/styles');
  const IOS_THEME = readFileSync(join(STYLES, 'ios.css'), 'utf8');
  const GROUPS = [
    {
      name: 'institutional-*.css (pages institutionnelles)',
      files: allFiles.filter((f) => f.startsWith(INSTITUTIONAL_DIR + '/')),
      /**
       * Prédicat plutôt qu'un préfixe unique : `institutional-*.css` reste
       * la SEULE feuille de ce groupe (source(none) + @source limité, voir
       * le doc-comment de tête) — un filtre par PRÉFIXE l'exprime aussi
       * bien qu'un filtre par groupe, et les deux formes cohabitent ici
       * pour que `sheetFor` ait une signature UNIQUE.
       */
      sheetMatch: (f) => f.startsWith('institutional-'),
      themeSource: readFileSync(join(STYLES, 'institutional.css'), 'utf8') + IOS_THEME,
    },
    {
      name: 'index-*.css + chunks d’écran (application)',
      files: allFiles.filter((f) => !f.startsWith(INSTITUTIONAL_DIR + '/')),
      /**
       * TOUTE feuille NON institutionnelle appartient à l'application — pas
       * seulement `index-*.css` (correction de revue #5648, défaut majeur
       * 6) : `thread-scene.css` (`src/routes/thread.tsx`) en est sortie
       * pour rejoindre le CHUNK du fil plutôt que la feuille critique
       * chargée sur CHAQUE route (poids, `measure-weight.mjs`). C'est une
       * partition par POIDS DE CHARGEMENT, jamais par THÈME : contrairement
       * à la frontière institutionnel/application (deux `@theme` distincts,
       * voir le doc-comment de tête), une classe utilitaire de
       * `focal-row.tsx` reste la MÊME classe, avec la MÊME table de jetons,
       * qu'elle vive dans la feuille critique ou dans un chunk à la
       * demande — les concaténer ne réintroduit donc PAS le faux-positif
       * que la scission institutionnel/application a corrigé. Un futur
       * écran qui sort sa propre feuille (`settings-*.css`, etc.) entre
       * automatiquement dans ce groupe, sans toucher ce fichier.
       */
      sheetMatch: (f) => !f.startsWith('institutional-'),
      themeSource: readFileSync(join(STYLES, 'app.css'), 'utf8') + IOS_THEME,
    },
  ];

  const sheetFor = (match) => {
    const assets = join(DIST, 'assets');
    const sheets = readdirSync(assets).filter((f) => f.endsWith('.css') && match(f));
    if (sheets.length === 0) {
      throw new Error(`Aucune feuille correspondante dans dist/assets — lancer \`vite build\` d’abord.`);
    }
    return sheets.map((f) => readFileSync(join(assets, f), 'utf8')).join('\n');
  };

  let totalUsed = 0;
  const dead = [];
  const sizeless = [];
  for (const group of GROUPS) {
    const css = sheetFor(group.sheetMatch);
    const used = usedClasses(group.files);
    const roles = textSizeRoles(group.themeSource);
    totalUsed += used.size;
    for (const [name, file] of used) {
      if (ALLOWED.has(name)) continue;
      if (!css.includes(`.${escapeForCss(name)}`)) {
        dead.push({ name, file, sheet: group.name });
        continue;
      }
    }
    for (const finding of sizelessTextClasses(used, css, roles)) sizeless.push({ ...finding, sheet: group.name });
  }

  if (dead.length > 0) {
    console.error(`\n  ${dead.length} classe(s) SANS RÈGLE dans la feuille qui les sert :\n`);
    for (const { name, file, sheet } of dead) console.error(`    ${name}  —  ${file}  (attendu dans ${sheet})`);
    console.error(
      '\n  Une classe absente de la feuille ne peint RIEN et ne rougit nulle part.\n' +
        '  Soit le jeton a été renommé et la classe ne l’a pas suivi, soit la\n' +
        '  classe n’a jamais existé, soit son `@theme` ne le déclare que dans\n' +
        '  L’AUTRE feuille. Corriger le nom, ou déclarer le jeton là où il sert.\n',
    );
    process.exit(1);
  }

  if (sizeless.length > 0) {
    console.error(`\n  ${sizeless.length} classe(s) dont la TAILLE promise est masquée par une couleur homonyme :\n`);
    for (const { name, file, sheet } of sizeless) console.error(`    ${name}  —  ${file}  (${sheet})`);
    console.error(
      '\n  Un `--text-<rôle>` est déclaré pour cette classe, mais la règle compilée\n' +
        '  ne porte aucun `font-size` — un `--color-<rôle>` du même nom a gagné la\n' +
        '  résolution Tailwind et la classe ne peint plus QUE la couleur. Renommer\n' +
        '  l’un des deux rôles pour lever la collision (jamais les deux sous le\n' +
        '  même nom).\n',
    );
    process.exit(1);
  }

  console.log(`\n  ${totalUsed} classes employées, toutes portées par la feuille qui les sert, avec le style promis.\n`);
};

if (import.meta.url === `file://${process.argv[1]}`) runCli();
