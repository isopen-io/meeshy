import { readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';

/**
 * Le cliquet du SITE UNIQUE du défi d'étape 2 (#4542).
 *
 * Trois inventaires, tous VIDES. Quand l'un tombe, la réparation est de faire
 * passer le nouveau site par `services/auth/pending-two-factor.ts` — jamais
 * d'ajouter une ligne à un inventaire, qui n'a par construction aucune liste
 * d'exceptions et ne doit jamais en acquérir.
 *
 * Chaque inventaire garde une MOITIÉ différente de la règle, parce qu'un
 * troisième producteur peut naître de trois façons distinctes :
 *
 * 1. `challengeColumnSites` — il NOMME les colonnes du défi. C'est la forme la
 *    plus large : on n'écrit ni ne lit une colonne sans l'écrire.
 * 2. `handRolledMintSites` — il FABRIQUE le jeton lui-même
 *    (`const twoFactorToken = crypto.…`), la forme exacte que portaient les
 *    deux copies avant leur fusion.
 * 3. `reborrowedColumnSites` — il REMET le défi dans la colonne d'une autre
 *    vérification, c'est-à-dire le défaut d'origine rejoué. `Reusing this
 *    field temporarily` a tenu assez longtemps pour rendre deux secrets
 *    interchangeables ; l'inventaire existe pour que la phrase ne se réécrive
 *    pas.
 */
export type SweepHit = {
  /** Chemin relatif à `src/`, pour que la clé ne dérive pas avec le dépôt. */
  readonly file: string;
  /** La ligne SOURCE, dépouillée — jamais un numéro de ligne, qui bouge. */
  readonly declaration: string;
};

/** Le seul fichier de production autorisé à nommer les colonnes du défi. */
export const SITE_UNIQUE = 'services/auth/pending-two-factor.ts';

/** Les colonnes PROPRES du défi. */
export const CHALLENGE_COLUMN = /\btwoFactorChallenge(Hash|ExpiresAt)\b/;

/**
 * Le jeton FABRIQUÉ sur place : `const twoFactorToken = crypto.randomBytes…`,
 * `twoFactorTokenHash = crypto.createHash…`.
 *
 * Le discriminant est l'AFFECTATION depuis `crypto`, pas la simple présence du
 * mot : les routes, les types et la mémoire de confiance d'appareil PORTENT un
 * `twoFactorToken` sans jamais en composer un, et un balayage qui les rougirait
 * ferait importer le site unique à des fichiers qui n'ont rien à minter.
 */
export const HAND_ROLLED_MINT = /\btwoFactorToken(Hash)?\s*(?::[^=\n]*)?=\s*crypto\./;

/**
 * Le défi REMIS dans la colonne d'une autre vérification : une clé
 * `phoneVerificationCode` / `phoneVerificationExpiry` (ou leurs jumelles
 * `pendingPhone…`) dont la VALEUR parle de second facteur.
 */
export const REBORROWED_COLUMN =
  /\b(pending)?[Pp]hone(Verification|VerificationCode|VerificationExpiry)?\w*\s*:\s*[^,;\n]*[Tt]wo[Ff]actor/;

/** Les commentaires CITENT la forme fautive pour l'expliquer — c'est leur rôle. */
export function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

export function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry === 'node_modules' || entry === 'dist') continue;
      walk(full, out);
      continue;
    }
    if (entry.endsWith('.ts') && !entry.endsWith('.d.ts')) out.push(full);
  }
  return out;
}

/**
 * Les fichiers de PRODUCTION de `src/`, chemin relatif et source dépouillée.
 *
 * Les bancs d'essai montent des doubles, et un double a le droit de nommer ce
 * qu'il double : ce qu'on garde ici, c'est la production.
 */
export function productionSources(srcDir: string): ReadonlyArray<{ file: string; source: string }> {
  return walk(srcDir)
    .map((full) => ({ file: full.slice(srcDir.length + 1), full }))
    .filter(({ file }) => !file.includes('__tests__') && !file.endsWith('.test.ts'))
    .map(({ file, full }) => ({ file, source: stripComments(readFileSync(full, 'utf8')) }));
}

function sweep(
  srcDir: string,
  pattern: RegExp,
  exempt: (file: string) => boolean
): SweepHit[] {
  const found: SweepHit[] = [];

  for (const { file, source } of productionSources(srcDir)) {
    if (exempt(file)) continue;
    for (const line of source.split('\n')) {
      if (!pattern.test(line)) continue;
      found.push({ file, declaration: line.trim() });
    }
  }

  return found;
}

const isSiteUnique = (file: string): boolean => file.replace(/\\/g, '/') === SITE_UNIQUE;

/** Inventaire 1 — qui NOMME les colonnes du défi hors du site unique. */
export const sweepChallengeColumnSites = (srcDir: string): SweepHit[] =>
  sweep(srcDir, CHALLENGE_COLUMN, isSiteUnique);

/** Inventaire 2 — qui FABRIQUE le jeton d'étape 2 hors du site unique. */
export const sweepHandRolledMintSites = (srcDir: string): SweepHit[] =>
  sweep(srcDir, HAND_ROLLED_MINT, isSiteUnique);

/** Inventaire 3 — qui REMET le défi dans la colonne d'une autre vérification. */
export const sweepReborrowedColumnSites = (srcDir: string): SweepHit[] =>
  sweep(srcDir, REBORROWED_COLUMN, () => false);

/**
 * Les fichiers CÂBLÉS : ceux qui font composer le défi par le site unique.
 *
 * Ils ne sont pas un inventaire à garder — ils sont la BORNE DE NON-VACUITÉ
 * des deux premiers. Un balayage qui ne voit rien passe au vert, et c'est la
 * pire façon de passer : tant que cette liste porte les deux producteurs
 * connus, on sait que l'arborescence est bien lue.
 */
export function wiredProducers(srcDir: string): string[] {
  return productionSources(srcDir)
    .filter(({ file, source }) =>
      !isSiteUnique(file) &&
      /from\s+['"][^'"]*auth\/pending-two-factor['"]/.test(source) &&
      source.includes('mintPendingTwoFactorChallenge')
    )
    .map(({ file }) => file);
}
