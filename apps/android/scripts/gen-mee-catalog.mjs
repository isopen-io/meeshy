#!/usr/bin/env bun
// Génère les catalogues Kotlin de Mee et Meo (164 films) et des Instants (100) — jamais recopiés à la main.
//
// SOURCE : les index que `apps/web/scripts/mee-ios-stickers.ts` et `apps/web/scripts/mee-ios-instants.ts`
// écrivent (Story/MeeStickerCatalog+Index.swift et Story/MeeInstantCatalog+Index.swift). Ces deux scripts
// sont les SEULS à lire le dessin du web (src/lib/mee/) et à mesurer les Instants dans Chromium ; les rejouer
// ici exigerait un navigateur et produirait une jumelle. Android lit donc leur sortie : une retouche du web
// passe par le script web, puis par `apps/android/scripts/gen-mee-catalog.mjs`.
//
// Usage : bun apps/android/scripts/gen-mee-catalog.mjs [--check]
//   (sans option) réécrit MeeStickerCatalogData.kt et MeeInstantCatalogData.kt, puis synchronise les films.
//   --check       échoue (code 1) quand un catalogue ou un asset a dérivé de sa source, sans rien écrire.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../../..');
const story = join(root, 'packages/MeeshySDK/Sources/MeeshyUI/Story');
const outDir = join(root, 'apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/sticker');
const check = process.argv.includes('--check');

const upper = (name) => name.replace(/([A-Z])/g, '_$1').toUpperCase();
const kt = (value) => `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\$/g, '\\$')}"`;
const str = '"((?:[^"\\\\]|\\\\.)*)"';
const unjson = (raw) => JSON.parse(`"${raw}"`);
const num = (value) => `${value}f`;

const banner = (script) => `// GÉNÉRÉ par apps/android/scripts/gen-mee-catalog.mjs depuis ${script} — ne pas modifier à la main.
// Pour le changer : modifier le script web, le rejouer, puis relancer \`bun apps/android/scripts/gen-mee-catalog.mjs\`.
`;

function stickersFile() {
  const swift = readFileSync(join(story, 'MeeStickerCatalog+Index.swift'), 'utf8');
  const order = /intentOrder: \[MeeSticker\.Intent\] = \[([^\]]*)\]/.exec(swift)?.[1];
  if (!order) throw new Error('intentOrder introuvable dans MeeStickerCatalog+Index.swift');
  const intents = order.split(',').map((item) => upper(item.trim().replace(/^\./, '')));
  const rows = [...swift.matchAll(new RegExp(`MeeSticker\\(id: ${str}, tab: \\.(\\w+), intent: \\.(\\w+), title: ${str}, emoji: ${str}, animated: (true|false)\\)`, 'g'))];
  const lines = rows.map(([, id, tab, intent, title, emoji, animated]) =>
    `        MeeSticker(${kt(unjson(id))}, MeeCharacter.${tab.toUpperCase()}, MeeIntent.${upper(intent)}, ${kt(unjson(title))}, ${kt(unjson(emoji))}, ${animated}),`);
  return {
    name: 'MeeStickerCatalogData.kt',
    count: rows.length,
    text: `${banner('apps/web/scripts/mee-ios-stickers.ts')}
package me.meeshy.sdk.model.sticker

internal object MeeStickerCatalogData {
    val INTENT_ORDER: List<MeeIntent> = listOf(${intents.map((i) => `MeeIntent.${i}`).join(', ')})

    val ALL: List<MeeSticker> = listOf(
${lines.join('\n')}
    )
}
`,
  };
}

const slotList = (raw) => raw.split(',').map((s) => s.trim()).filter(Boolean).map((s) => `MeeSlot.${s.replace(/^\./, '').toUpperCase()}`);

function instantsFile() {
  const swift = readFileSync(join(story, 'MeeInstantCatalog+Index.swift'), 'utf8');
  const box = /CGRect\(x: (-?[\d.]+), y: (-?[\d.]+), width: ([\d.]+), height: ([\d.]+)\)/.exec(swift);
  if (!box) throw new Error('viewBox introuvable dans MeeInstantCatalog+Index.swift');
  const rows = swift.split('\n').filter((line) => line.trim().startsWith('MeeInstant(id:'));
  const lines = rows.map((line) => {
    const head = new RegExp(`^\\s*MeeInstant\\(id: ${str}, kind: \\.(\\w+), title: ${str}, emoji: ${str}, animated: (true|false), slots: \\[([^\\]]*)\\], defaults: `).exec(line);
    if (!head) throw new Error(`Instant illisible : ${line.slice(0, 80)}`);
    const [prefix, id, kind, title, emoji, animated, slots] = head;
    const bandAt = line.indexOf(', band: ', prefix.length);
    const textsAt = line.indexOf(', texts: [', bandAt);
    const defaults = [...line.slice(prefix.length, bandAt).matchAll(new RegExp(`\\.(\\w+): ${str}`, 'g'))]
      .map(([, slot, value]) => `MeeSlot.${slot.toUpperCase()} to ${kt(unjson(value))}`);
    const bandRaw = line.slice(bandAt + 8, textsAt);
    const band = bandRaw === 'nil'
      ? 'null'
      : (() => {
          const m = /main: \.(\w+), sub: (nil|\.\w+), fill: (0x[0-9A-F]+), ink: (0x[0-9A-F]+), stroke: (0x[0-9A-F]+)/.exec(bandRaw);
          if (!m) throw new Error(`bandeau illisible : ${bandRaw}`);
          return `MeeInstantBand(MeeSlot.${m[1].toUpperCase()}, ${m[2] === 'nil' ? 'null' : `MeeSlot.${m[2].slice(1).toUpperCase()}`}, ${m[3]}, ${m[4]}, ${m[5]})`;
        })();
    const textsRaw = line.slice(textsAt + 10, line.lastIndexOf(']'));
    const texts = textsRaw.split('.init(slot: ').slice(1).map((chunk) => {
      const m = /^\.?(\w+), x: (-?[\d.]+), y: (-?[\d.]+), rotation: (-?[\d.]+), scale: ([\d.]+), anchor: \.(\w+), weight: (\d+), fill: (0x[0-9A-F]+), opacity: ([\d.]+), sizes: \[(.*?)\], max: (nil|\d+)\)/.exec(chunk);
      if (!m) throw new Error(`texte libre illisible : ${chunk.slice(0, 80)}`);
      const sizes = [...m[10].matchAll(/from: (\d+), size: ([\d.]+)/g)].map(([, from, size]) => `MeeTextSize(${from}, ${num(size)})`);
      return `MeeInstantText(MeeSlot.${m[1].toUpperCase()}, ${num(m[2])}, ${num(m[3])}, ${num(m[4])}, ${num(m[5])}, MeeTextAnchor.${m[6].toUpperCase()}, ${m[7]}, ${m[8]}, ${num(m[9])}, listOf(${sizes.join(', ')}), ${m[11] === 'nil' ? 'null' : m[11]})`;
    });
    return `        MeeInstant(${kt(unjson(id))}, MeeInstantKind.${kind.toUpperCase()}, ${kt(unjson(title))}, ${kt(unjson(emoji))}, ${animated}, listOf(${slotList(slots).join(', ')}), ${defaults.length ? `mapOf(${defaults.join(', ')})` : 'emptyMap()'}, ${band}, ${texts.length ? `listOf(${texts.join(', ')})` : 'emptyList()'}),`;
  });
  return {
    name: 'MeeInstantCatalogData.kt',
    count: rows.length,
    text: `${banner('apps/web/scripts/mee-ios-instants.ts')}
package me.meeshy.sdk.model.sticker

internal object MeeInstantCatalogData {
    const val VIEW_BOX_X: Float = ${num(box[1])}
    const val VIEW_BOX_Y: Float = ${num(box[2])}
    const val VIEW_BOX_WIDTH: Float = ${num(box[3])}
    const val VIEW_BOX_HEIGHT: Float = ${num(box[4])}

    val ALL: List<MeeInstant> = listOf(
${lines.join('\n')}
    )
}
`,
  };
}

const drift = [];
[stickersFile(), instantsFile()].forEach(({ name, text, count }) => {
  const path = join(outDir, name);
  const current = existsSync(path) ? readFileSync(path, 'utf8') : null;
  if (check) {
    if (current !== text) drift.push(name);
    return;
  }
  mkdirSync(outDir, { recursive: true });
  if (current !== text) writeFileSync(path, text);
  process.stdout.write(`${name} : ${count} entrées\n`);
});

const sync = spawnSync('bash', [join(here, 'sync-mee-assets.sh'), ...(check ? ['--check'] : [])], { stdio: 'inherit' });
if (sync.status !== 0) drift.push('assets .lottie');
if (drift.length > 0) {
  process.stderr.write(`dérive : ${drift.join(', ')} — relancer bun apps/android/scripts/gen-mee-catalog.mjs\n`);
  process.exit(1);
}
