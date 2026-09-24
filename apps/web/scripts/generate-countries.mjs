#!/usr/bin/env node
/**
 * GÉNÈRE `src/lib/countries.ts` DEPUIS `CountryPicker.swift` (#5555, E4).
 *
 * La table des indicatifs téléphoniques (`dialCodes`, ISO 3166-1 alpha-2 →
 * E.164) et l'ordre de priorité (`priority`, France en tête) SONT dans
 * `packages/MeeshySDK/Sources/MeeshyUI/Auth/Components/CountryPicker.swift` —
 * recopier ces 242 lignes à la main serait exactement la SECONDE TABLE que la
 * charte interdit (§ 12.5 règle 1). Ce script les lit et projette.
 *
 * CE QUI NE VOYAGE PAS ICI : le NOM localisé du pays. `CountryPicker.swift`
 * le dérive de `Locale.current.localizedString(forRegionCode:)`, une source
 * qui n'existe pas côté build Node — et l'embarquer romprait la promesse
 * i18n (242 noms dans UNE langue). Le consommateur web le dérive à
 * l'exécution avec `Intl.DisplayNames(document.documentElement.lang, {type:
 * 'region'})`, l'équivalent exact côté plateforme.
 *
 * L'ORDRE : les pays de `priority` (France en tête, ordre Swift), puis le
 * reste par ISO croissant — `CountryPicker.swift` trie le reste par NOM
 * localisé, une information absente ici ; l'ISO est l'ordre stable le plus
 * proche que ce générateur puisse produire sans lui.
 *
 *   node scripts/generate-countries.mjs            écrit src/lib/countries.ts
 *   node scripts/generate-countries.mjs --check  échoue si le fichier a dérivé
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const SOURCE = join(HERE, '../../../packages/MeeshySDK/Sources/MeeshyUI/Auth/Components/CountryPicker.swift');
const OUTPUT = join(HERE, '../src/lib/countries.ts');

const echoue = (message) => {
  console.error(`\n  GÉNÉRATION REFUSÉE — ${message}\n`);
  process.exit(1);
};

const source = readFileSync(SOURCE, 'utf8');

const priorityMatch = /private static let priority: \[String\] = \[([\s\S]*?)\]/.exec(source);
if (!priorityMatch) echoue('bloc `priority` introuvable dans CountryPicker.swift');
const priority = [...priorityMatch[1].matchAll(/"([A-Z]{2})"/g)].map((m) => m[1]);

const dialMatch = /private static let dialCodes: \[String: String\] = \[([\s\S]*?)\n\s*\]/.exec(source);
if (!dialMatch) echoue('bloc `dialCodes` introuvable dans CountryPicker.swift');
const dialCodes = new Map(
  [...dialMatch[1].matchAll(/"([A-Z]{2})":\s*"(\+\d+)"/g)].map((m) => [m[1], m[2]]),
);
if (dialCodes.size < 200) echoue(`trop peu d'indicatifs lus (${dialCodes.size}) — le motif a-t-il changé ?`);

/** Drapeau dérivé du code ISO — indicateurs régionaux Unicode, identique à
 * `CountryPicker.flag(for:)`. */
function flagOf(iso) {
  const base = 127397; // 0x1F1E6 - 'A'
  return [...iso].map((c) => String.fromCodePoint(base + c.charCodeAt(0))).join('');
}

const rank = new Map(priority.map((iso, i) => [iso, i]));
const ordered = [...dialCodes.keys()].sort((a, b) => {
  const ra = rank.has(a) ? rank.get(a) : Number.POSITIVE_INFINITY;
  const rb = rank.has(b) ? rank.get(b) : Number.POSITIVE_INFINITY;
  if (ra !== rb) return ra - rb;
  return a.localeCompare(b);
});

const rows = ordered.map((iso) => `  { id: '${iso}', dialCode: '${dialCodes.get(iso)}', flag: '${flagOf(iso)}' },`);

const output = `/* GÉNÉRÉ par scripts/generate-countries.mjs depuis CountryPicker.swift.
 * Ne pas éditer à la main : relancer \`node scripts/generate-countries.mjs\`.
 *
 * Source : packages/MeeshySDK/Sources/MeeshyUI/Auth/Components/CountryPicker.swift
 * (\`dialCodes\`, \`priority\`) — voir le doc-comment du générateur pour ce qui
 * NE voyage pas ici (le nom localisé, dérivé à l'exécution par le consommateur
 * via \`Intl.DisplayNames\`).
 */

export type Country = {
  readonly id: string;
  readonly dialCode: string;
  readonly flag: string;
};

export const COUNTRIES: readonly Country[] = [
${rows.join('\n')}
];

const BY_ID = new Map(COUNTRIES.map((c) => [c.id, c]));

export function countryOf(id: string): Country | undefined {
  return BY_ID.get(id.toUpperCase());
}

/** Nom localisé d'un pays dans la langue du document — repli sur l'ISO si
 * \`Intl.DisplayNames\` est indisponible (rendu hors navigateur). */
export function countryName(country: Country, locale: string): string {
  try {
    return new Intl.DisplayNames([locale], { type: 'region' }).of(country.id) ?? country.id;
  } catch {
    return country.id;
  }
}
`;

if (process.argv.includes('--check')) {
  let current = null;
  try {
    current = readFileSync(OUTPUT, 'utf8');
  } catch {
    echoue('countries.ts absent — le régénérer');
  }
  if (current !== output) {
    echoue(
      `countries.ts a DÉRIVÉ de CountryPicker.swift.\n` +
        `  Régénérer avec : node scripts/generate-countries.mjs`,
    );
  }
  console.log('  countries.ts est conforme à CountryPicker.swift.');
  process.exit(0);
}

writeFileSync(OUTPUT, output);
console.log(`  countries.ts écrit — ${ordered.length} pays, France en tête.`);
