/**
 * Transformation SANS PERTE d'un JPEG par `jpegtran` (libjpeg-turbo, paquet
 * `libjpeg-turbo-progs`, #11841) : les coefficients DCT sont permutés, jamais
 * décodés ni requantifiés — les tables de quantification d'origine restent,
 * aucune génération d'encodage n'est perdue.
 *
 * `-perfect` refuse la transformation quand les dimensions ne tombent pas sur
 * la grille des blocs (MCU) : sans lui, `jpegtran` laisserait le bord partiel
 * à sa place d'origine, donc de travers. `-copy all` garde les segments
 * d'en-tête (profil ICC, métadonnées de carte de gain) que la liste blanche
 * trie ensuite.
 *
 * Rend `null` quand la transformation n'a pas lieu — bord hors grille, binaire
 * absent, délai dépassé, structure illisible : l'appelant retombe sur son
 * réencodage. Rien n'est écrit sur disque.
 */
import { spawn } from 'child_process';

const TRANSFORMS: Readonly<Record<number, readonly string[]>> = {
  2: ['-flip', 'horizontal'],
  3: ['-rotate', '180'],
  4: ['-flip', 'vertical'],
  5: ['-transpose'],
  6: ['-rotate', '90'],
  7: ['-transverse'],
  8: ['-rotate', '270'],
};

const TIMEOUT_MS = 20_000;

export type JpegtranRunner = (args: readonly string[], input: Buffer) => Promise<Buffer | null>;

export const runJpegtran: JpegtranRunner = (args, input) =>
  new Promise((resolve) => {
    const child = spawn('jpegtran', [...args], { stdio: ['pipe', 'pipe', 'ignore'], timeout: TIMEOUT_MS });
    const chunks: Buffer[] = [];
    child.stdout.on('data', (chunk: Buffer) => chunks.push(chunk));
    child.on('error', () => resolve(null));
    child.on('close', (code) => resolve(code === 0 && chunks.length > 0 ? Buffer.concat(chunks) : null));
    child.stdin.on('error', () => undefined);
    child.stdin.end(input);
  });

/** Le JPEG redressé selon son orientation EXIF, sans perte ; `null` si impossible. */
export async function losslesslyOriented(jpeg: Buffer, orientation: number, run: JpegtranRunner = runJpegtran): Promise<Buffer | null> {
  const transform = TRANSFORMS[orientation];
  if (transform === undefined) return null;
  return run(['-copy', 'all', '-perfect', ...transform], jpeg);
}
