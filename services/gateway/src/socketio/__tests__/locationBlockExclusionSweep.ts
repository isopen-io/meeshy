/**
 * LE CLIQUET DE L'EXCLUSION DE BLOCAGE SUR LA POSITION EN DIRECT (#16745).
 *
 * Pourquoi un cliquet, et pas seulement des témoins de comportement : ce qui a
 * laissé `LOCATION_LIVE_*` partir au salon ENTIER pendant toute la vie de la
 * feature n'est pas une erreur de raisonnement — c'est qu'aucun mécanisme
 * n'obligeait à poser la question. Les deux autres signaux du même salon
 * filtraient le blocage, chacun chez soi, et rien ne confrontait le troisième à
 * sa propre famille. Un témoin de comportement garde les sites qui EXISTENT ;
 * celui-ci garde le SUIVANT, celui qu'un lot futur ajoutera.
 *
 * ─── La règle qu'il encode ───────────────────────────────────────────────────
 *
 * Seules les ANNONCES se filtrent — `LOCATION_LIVE_STARTED` et
 * `LOCATION_LIVE_UPDATED`, les deux événements qui révèlent une coordonnée. Une
 * RÉTRACTATION (`LOCATION_LIVE_STOPPED`) ne se filtre pas : elle ne porte
 * aucune position, et c'est le seul chemin qui retire une épingle (la raison
 * complète est dans l'en-tête de `LocationHandler`). Le cliquet ne la regarde
 * donc pas — et ce silence est une DÉCISION, pas un oubli : s'il l'exigeait, il
 * pousserait le prochain lot à reposer le défaut qu'on vient de retirer.
 *
 * ─── Ce qu'il voit, et pourquoi la première version n'en voyait qu'un sixième ─
 *
 * La première version exigeait `.to(` ET une cible matchant `/^ROOMS\./`. Elle
 * ratait donc l'idiome DOMINANT du répertoire — `const room = ROOMS.conversation(id)`
 * puis `.to(room)`, que le jumeau de référence lui-même emploie
 * (`StatusHandler`) — ainsi que `.in()` (l'alias socket.io de `.to()`), un nom
 * d'événement mis en variable, et tout opérateur intercalé (`.volatile`).
 * Chercher la forme JUSTE est ce qui l'aveuglait : un cliquet se règle sur la
 * forme CONFORME, dont il n'y a qu'une, et traite tout le reste comme à
 * instruire.
 *
 * Il relève donc TOUTE émission d'une annonce dont la chaîne n'est pas produite
 * par `EXCLUSION_COMPOSER`, et ne fait d'exception que pour les deux formes qui
 * ne visent pas un salon :
 *
 * - `socket.emit(...)` / `joiner.emit(...)` — une émission à UN socket nommé,
 *   ce que le rattrapage fait après avoir filtré sa liste ;
 * - `callback(...)` — l'ACK, qui ne part qu'au partageur.
 *
 * Toute autre chaîne est signalée, y compris celles qui n'existent pas encore.
 * Un faux positif se répare en routant par le composeur, jamais en élargissant
 * l'exception : c'est la direction qui rend un cliquet utile.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

/** L'unique composeur d'exclusion, celui par lequel une annonce doit passer. */
export const EXCLUSION_COMPOSER = '_fromSocketExcept';

/** Les deux événements qui RÉVÈLENT une coordonnée. Le retrait n'en est pas. */
export const ANNOUNCEMENT_EVENTS = ['LOCATION_LIVE_STARTED', 'LOCATION_LIVE_UPDATED'] as const;

export type UnguardedAnnouncement = {
  /** Chemin relatif à la racine balayée, pour que le rouge nomme le fichier. */
  readonly file: string;
  /** La ligne, 1-indexée, telle qu'un éditeur la numérote. */
  readonly line: number;
  /** La chaîne d'émission, pour que le rouge nomme la FORME et pas un numéro. */
  readonly chain: string;
};

const EMIT_CHAIN =
  /([A-Za-z_$][\w$.\s]*(?:\([^()]*(?:\([^()]*\)[^()]*)*\))?(?:\s*\.\s*[A-Za-z_$][\w$]*\s*(?:\([^()]*(?:\([^()]*\)[^()]*)*\))?)*)\s*\.\s*emit\s*\(/g;

/**
 * Les émissions d'ANNONCE dont la chaîne ne passe pas par le composeur
 * d'exclusion, dans une source.
 *
 * Reconnaît l'annonce sur l'ARGUMENT de l'émission — `SERVER_EVENTS.X`, ou une
 * variable dont le fichier montre qu'elle en porte un. La seconde forme est ce
 * qui ferme le contournement « mettre le nom dans une constante ».
 */
export function sweepUnguardedAnnouncements(source: string, file = '<source>'): UnguardedAnnouncement[] {
  const stripped = stripComments(source);
  const aliases = announcementAliases(stripped);
  const found: UnguardedAnnouncement[] = [];

  for (let m = EMIT_CHAIN.exec(stripped); m !== null; m = EMIT_CHAIN.exec(stripped)) {
    const argument = stripped.slice(m.index + m[0].length, m.index + m[0].length + 200);
    if (!announces(argument, aliases)) continue;

    const chain = m[1].trim();
    if (chain.includes(EXCLUSION_COMPOSER)) continue;
    if (targetsOneSocket(chain)) continue;

    found.push({ file, line: lineOf(stripped, m.index), chain: chain.replace(/\s+/g, ' ') });
  }

  return found;
}

/** Le balayage sur une arborescence entière — jamais un seul fichier (cf. le § du cliquet). */
export function sweepTree(root: string): UnguardedAnnouncement[] {
  return tsFiles(root).flatMap(path =>
    sweepUnguardedAnnouncements(readFileSync(join(root, path), 'utf8'), path)
  );
}

/** Combien d'émissions d'annonce l'arbre porte — un balayage qui ne lit RIEN rend `[]`. */
export function countAnnouncements(root: string): number {
  return tsFiles(root).reduce((total, path) => {
    const source = stripComments(readFileSync(join(root, path), 'utf8'));
    const aliases = announcementAliases(source);
    let count = 0;
    for (let m = EMIT_CHAIN.exec(source); m !== null; m = EMIT_CHAIN.exec(source)) {
      const argument = source.slice(m.index + m[0].length, m.index + m[0].length + 200);
      if (announces(argument, aliases)) count += 1;
    }
    return total + count;
  }, 0);
}

function announces(argument: string, aliases: readonly string[]): boolean {
  if (ANNOUNCEMENT_EVENTS.some(name => new RegExp(`SERVER_EVENTS\\s*\\.\\s*${name}\\b`).test(argument))) return true;
  return aliases.some(alias => new RegExp(`^\\s*${alias}\\b`).test(argument));
}

/** Les variables locales auxquelles un nom d'annonce a été affecté. */
function announcementAliases(source: string): string[] {
  const names = ANNOUNCEMENT_EVENTS.join('|');
  return [...source.matchAll(
    new RegExp(`(?:const|let|var)\\s+([A-Za-z_$][\\w$]*)\\s*(?::[^=]*)?=\\s*SERVER_EVENTS\\s*\\.\\s*(?:${names})\\b`, 'g')
  )].map(m => m[1]);
}

/**
 * Une chaîne qui vise UN socket nommé, pas un salon.
 *
 * Le discriminant est l'ABSENCE de sélecteur d'audience : `socket.emit(...)` et
 * `callback(...)` n'en ont pas, alors que `.to(...)`, `.in(...)` et `.except(...)`
 * en sont un. C'est l'inverse de la première version, qui cherchait la présence
 * de `.to(` — et ratait donc tout sélecteur qu'elle n'avait pas énuméré.
 */
function targetsOneSocket(chain: string): boolean {
  if (/\.\s*(?:to|in|except|volatile|compress|timeout)\b/.test(chain)) return false;
  return /^[A-Za-z_$][\w$]*$/.test(chain);
}

/**
 * Les sources de PRODUCTION de l'arbre.
 *
 * Les répertoires de témoins sont écartés, et ce n'est pas une commodité : ce
 * fichier-ci porte sept sources FABRIQUÉES non filtrées, qui prouvent que le
 * cliquet tombe. Les balayer rendrait le cliquet rouge à cause de sa propre
 * preuve — et le réparer en retirant ces sources retirerait la seule chose qui
 * atteste qu'il fonctionne.
 */
const TEST_DIRS = new Set(['__tests__', 'node_modules', 'dist', '__mocks__', 'fixtures']);

function tsFiles(root: string, prefix = ''): string[] {
  return readdirSync(join(root, prefix)).flatMap(entry => {
    const relative = prefix === '' ? entry : `${prefix}/${entry}`;
    if (statSync(join(root, relative)).isDirectory()) {
      return TEST_DIRS.has(entry) ? [] : tsFiles(root, relative);
    }
    const isProductionSource =
      entry.endsWith('.ts') && !entry.endsWith('.d.ts') && !/\.(test|spec)\.ts$/.test(entry);
    return isProductionSource ? [relative] : [];
  });
}

function lineOf(source: string, index: number): number {
  return source.slice(0, index).split('\n').length;
}

/**
 * Les commentaires sont REMPLACÉS PAR DES ESPACES, jamais supprimés : les
 * numéros de ligne du relevé doivent rester ceux du fichier, sans quoi un rouge
 * envoie chercher au mauvais endroit.
 */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, block => block.replace(/[^\n]/g, ' '));
}
