#!/usr/bin/env node
/**
 * GÉNÈRE `MeeshyPaletteGenerated.kt` DEPUIS LES SOURCES SWIFT.
 *
 * Second cible de la chaîne qui produit `ios.css` pour le web (#5445) : même
 * source (`MeeshyColors.swift`), même parseur strict
 * (`scripts/lib/parse-ios-theme.mjs`), une autre sortie. Android recopiait la
 * palette iOS à la main dans `MeeshyPalette.kt` — une seconde table qui a déjà
 * perdu des teintes en silence. Elle est désormais DÉRIVÉE, et `--check` le
 * prouve en CI (`android.yml`).
 *
 * La sortie liste chaque `Color(hex: "…")` de `MeeshyColors.swift`, dans
 * l'ordre du fichier, sous son nom en PascalCase (`indigo500` -> `Indigo500`).
 * `MeeshyPalette` y délègue : ses noms restent valides, aucun site d'appel ne
 * bouge.
 *
 *   node scripts/generate-android-from-ios.mjs            écrit le fichier Kotlin
 *   node scripts/generate-android-from-ios.mjs --check    échoue si le fichier a dérivé
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { parseColors, parseHexConstants } from './lib/parse-ios-theme.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '../../..');
const COULEURS = join(ROOT, 'packages/MeeshySDK/Sources/MeeshyUI/Theme/MeeshyColors.swift');
const OUTPUT = join(ROOT, 'apps/android/sdk-ui/src/main/kotlin/me/meeshy/ui/theme/MeeshyPaletteGenerated.kt');

const echoue = (message) => {
  console.error(`\n  GÉNÉRATION REFUSÉE — ${message}\n`);
  process.exit(1);
};

const swift = readFileSync(COULEURS, 'utf8');
// Le parseur strict lit TOUT le fichier : une forme inconnue fait échouer ici
// aussi, pas seulement dans la cible web.
parseColors(swift, echoue);
const couleurs = parseHexConstants(swift);
if (couleurs.length === 0) echoue('aucune Color(hex:) trouvée dans MeeshyColors.swift');

const noms = new Set();
const lignes = couleurs.map(([nom, hex]) => {
  const kotlin = nom[0].toUpperCase() + nom.slice(1);
  if (noms.has(kotlin)) echoue(`nom Kotlin en double : ${kotlin}`);
  noms.add(kotlin);
  return `    val ${kotlin}: Color = Color(0xFF${hex})`;
});

const output = `package me.meeshy.ui.theme

import androidx.compose.ui.graphics.Color

/*
 * GÉNÉRÉ — ne pas éditer à la main.
 *
 * Produit par packages/design-tokens/scripts/generate-android-from-ios.mjs depuis
 * MeeshyColors.swift, qui est la SOURCE.
 * Régénérer : node packages/design-tokens/scripts/generate-android-from-ios.mjs
 * Vérifier  : … --check   (le gate de CI android.yml ; échoue si ce fichier a dérivé)
 */

/** Chaque \`Color(hex:)\` de MeeshyColors.swift (${couleurs.length}), dans l'ordre du fichier. */
internal object MeeshyPaletteGenerated {
${lignes.join('\n')}

    /** La même table par nom Kotlin : ce que \`IosColorSourceParityTest\` rejoue contre le Swift. */
    val ByName: Map<String, Color> = mapOf(
${[...noms].map((n) => `        "${n}" to ${n},`).join('\n')}
    )
}
`;

if (process.argv.includes('--check')) {
  let current = null;
  try {
    current = readFileSync(OUTPUT, 'utf8');
  } catch {
    echoue('MeeshyPaletteGenerated.kt absent — le régénérer');
  }
  if (current !== output) {
    echoue(
      `MeeshyPaletteGenerated.kt a DÉRIVÉ de MeeshyColors.swift.\n` +
        `  Une couleur modifiée côté Swift doit être régénérée côté Android :\n` +
        `  node packages/design-tokens/scripts/generate-android-from-ios.mjs`,
    );
  }
  console.log('  MeeshyPaletteGenerated.kt est conforme à MeeshyColors.swift.');
  process.exit(0);
}

writeFileSync(OUTPUT, output);
console.log(`  MeeshyPaletteGenerated.kt écrit — ${couleurs.length} couleurs.`);
