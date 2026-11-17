/** Arguments du générateur des vecteurs de l'ajout d'appareil (`generate-device-verification-vectors.mjs`) : chemins de la table amont, du dossier de sortie, du fichier précédent dont les signatures sont reprises, et `--check`. */
import { existsSync, mkdtempSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const ARGS = process.argv.slice(2);
const flag = (name) => { const i = ARGS.indexOf(name); return i < 0 ? undefined : ARGS[i + 1]; };
export const CHECK = ARGS.includes('--check');
const positional = ARGS.filter((a, i) => !a.startsWith('--') && !(i > 0 && ARGS[i - 1] === '--previous'));
const HERE = dirname(fileURLToPath(import.meta.url));
export const FIXTURES = join(HERE, '..', '..', 'fixtures', 'e2ee-device-verification');
export const emojiSourcePath = positional[0] ?? join(FIXTURES, 'upstream', 'matrix-sas-emoji.json');
export const upstreamLicensePath = positional[2] ?? join(FIXTURES, 'upstream', 'LICENSE');
export const outDir = CHECK ? mkdtempSync(join(tmpdir(), 'device-verification-')) : (positional[1] ?? FIXTURES);
export const previousLedgerPath = flag('--previous') ?? join(positional[1] ?? FIXTURES, 'trust-ledger-v1.cases.json');
if (!existsSync(emojiSourcePath)) {
  process.stderr.write(`table amont introuvable : ${emojiSourcePath}\n`);
  process.exit(2);
}
