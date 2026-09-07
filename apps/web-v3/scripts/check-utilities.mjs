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
const ALLOWED = new Map([
  ['group', 'marqueur de variante Tailwind : aucune règle propre'],
  ['peer', 'idem'],
  ['sr-only', 'émis seulement quand employé ; conservé comme utilitaire natif'],
  ['lens-row', 'crochet de sélection de la scène et du témoin — aucun style attendu'],
  ['lens-extra', 'idem : ce que la scène montre ou cache par style inline'],
]);

const sourceFiles = (dir) =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = join(dir, e.name);
    if (e.isDirectory()) return sourceFiles(p);
    return /\.(tsx|ts)$/.test(e.name) ? [p] : [];
  });

/** Les classes écrites dans le source, variantes ôtées. */
const usedClasses = () => {
  const found = new Map();
  for (const file of sourceFiles(join(ROOT, 'src'))) {
    const text = readFileSync(file, 'utf8');
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

const escapeForCss = (name) => name.replace(/[.[\]/%#(),!:]/g, (c) => `\\${c}`);

const builtCss = () => {
  const assets = join(DIST, 'assets');
  const sheets = readdirSync(assets).filter((f) => f.endsWith('.css'));
  if (sheets.length === 0) {
    throw new Error('Aucune feuille dans dist/assets — lancer `vite build` d’abord.');
  }
  return sheets.map((f) => readFileSync(join(assets, f), 'utf8')).join('\n');
};

const css = builtCss();
const dead = [];
for (const [name, file] of usedClasses()) {
  if (ALLOWED.has(name)) continue;
  if (css.includes(`.${escapeForCss(name)}`)) continue;
  dead.push({ name, file });
}

if (dead.length > 0) {
  console.error(`\n  ${dead.length} classe(s) SANS RÈGLE dans la feuille produite :\n`);
  for (const { name, file } of dead) console.error(`    ${name}  —  ${file}`);
  console.error(
    '\n  Une classe absente de la feuille ne peint RIEN et ne rougit nulle part.\n' +
      '  Soit le jeton a été renommé et la classe ne l’a pas suivi, soit la\n' +
      '  classe n’a jamais existé. Corriger le nom, ou déclarer le jeton.\n',
  );
  process.exit(1);
}
console.log(`\n  ${usedClasses().size} classes employées, toutes portées par la feuille produite.\n`);
