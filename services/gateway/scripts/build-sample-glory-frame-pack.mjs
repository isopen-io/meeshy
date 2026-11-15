// Construit le pack de cadres D'EXEMPLE du staging (#10157, demande porteur 2026-10-11) :
// vignettes WebP 270×480, contrat, chaînes des sept langues, tous adressés par contenu
// sous services/gateway/assets/packs/, et l'entrée de registre
// packages/shared/design/packs/samples/glory-frame.json — que PackIndex ne lit QUE sous PACK_SAMPLES=1.
//
// Les PNG 540×960 viennent des SVG du générateur des cadres de gloire, rendus par Chromium :
//   cd docs/product/cadres-de-gloire/generateur/ateliers/savane && python3 run.py amb
//   (puis un rendu PNG de out/savane/savane-ambassadeur-{4,3,2,1}.svg, comme lib/render.mjs)
// Usage : node services/gateway/scripts/build-sample-glory-frame-pack.mjs <dossier des PNG>
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import sharp from 'sharp';

const ROOT = resolve(new URL('.', import.meta.url).pathname, '../../..');
const ASSETS = join(ROOT, 'services/gateway/assets/packs');
const REGISTRY = join(ROOT, 'packages/shared/design/packs/samples/glory-frame.json');
const SLUG = 'exemple-savane';

const FRAMES = [
  { division: 4, names: { fr: 'Les Takienta du Koutammakou', en: 'The Takienta of Koutammakou', es: 'Las takienta de Koutammakou', pt: 'As takienta de Koutammakou', de: 'Die Takienta von Koutammakou', it: 'Le takienta del Koutammakou', ar: 'تاكيينتا كوتاماكو' } },
  { division: 3, names: { fr: "L'Achum de Bafut", en: 'The Achum of Bafut', es: 'El Achum de Bafut', pt: 'O Achum de Bafut', de: 'Das Achum von Bafut', it: "L'Achum di Bafut", ar: 'أتشوم بافوت' } },
  { division: 2, names: { fr: "Les Stèles d'Aksoum", en: 'The Stelae of Aksum', es: 'Las estelas de Aksum', pt: 'As estelas de Axum', de: 'Die Stelen von Aksum', it: 'Le stele di Axum', ar: 'مسلات أكسوم' } },
  { division: 1, names: { fr: 'La Cour ndebele', en: 'The Ndebele Courtyard', es: 'El patio ndebele', pt: 'O pátio ndebele', de: 'Der Ndebele-Hof', it: 'La corte ndebele', ar: 'فناء الندبيلي' } },
];

const PACK_NAMES = {
  fr: { name: 'Exemple · Savane', description: "Pack d'exemple du staging : quatre cadres d'Ambassadeur, de la division IV à la I." },
  en: { name: 'Sample · Savanna', description: 'Staging sample pack: four Ambassador frames, divisions IV to I.' },
  es: { name: 'Ejemplo · Sabana', description: 'Paquete de ejemplo del entorno de pruebas: cuatro marcos de Embajador, de la división IV a la I.' },
  pt: { name: 'Exemplo · Savana', description: 'Pacote de exemplo do ambiente de testes: quatro molduras de Embaixador, da divisão IV à I.' },
  de: { name: 'Beispiel · Savanne', description: 'Beispielpaket der Testumgebung: vier Botschafter-Rahmen, Division IV bis I.' },
  it: { name: 'Esempio · Savana', description: "Pacchetto di esempio dell'ambiente di prova: quattro cornici da Ambasciatore, dalla divisione IV alla I." },
  ar: { name: 'مثال · السافانا', description: 'حزمة تجريبية لبيئة الاختبار: أربعة إطارات لرتبة السفير، من القسم الرابع إلى الأول.' },
};
const LANGUAGES = Object.keys(PACK_NAMES);

/** Écrit un fichier adressé par contenu et rend sa référence `{ src, bytes, sha256 }`. */
function store(bytes, ext) {
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  const src = `${sha256.slice(0, 16)}.${ext}`;
  writeFileSync(join(ASSETS, src), bytes);
  return { src, bytes: bytes.length, sha256 };
}

const json = (value) => Buffer.from(`${JSON.stringify(value, null, 1)}\n`, 'utf8');
const nameKey = (division) => `frame.${SLUG}.ambassadeur-${division}.name`;

const pngDir = process.argv[2];
if (!pngDir) throw new Error('usage : build-sample-glory-frame-pack.mjs <dossier des PNG savane-ambassadeur-N.png>');
mkdirSync(ASSETS, { recursive: true });

const thumbs = await Promise.all(
  FRAMES.map(async ({ division }) =>
    store(await sharp(readFileSync(join(pngDir, `savane-ambassadeur-${division}.png`))).resize(270, 480).webp({ quality: 82, effort: 6 }).toBuffer(), 'webp'),
  ),
);
const contract = store(
  json({
    schema: 1,
    frames: FRAMES.map(({ division }, index) => ({
      id: `${SLUG}.ambassadeur-${division}`,
      usage: { kind: 'rank', rank: 'ambassadeur', division },
      thumb: thumbs[index],
      i18n: { name: nameKey(division) },
    })),
  }),
  'json',
);
const strings = Object.fromEntries(
  LANGUAGES.map((language) => [language, store(json(Object.fromEntries(FRAMES.map(({ division, names }) => [nameKey(division), names[language]]))), 'json')]),
);
const largestStrings = Math.max(...Object.values(strings).map((ref) => ref.bytes));

const entry = {
  slug: SLUG,
  domain: 'glory-frame',
  origin: 'official',
  version: 1,
  order: 1000,
  installedByDefault: false,
  removable: true,
  hidden: false,
  contractSchema: 1,
  cover: thumbs[thumbs.length - 1],
  preview: null,
  contract,
  strings,
  downloadBytes: { story: thumbs.reduce((sum, ref) => sum + ref.bytes, 0) + contract.bytes + largestStrings, square: null },
  names: PACK_NAMES,
  usage: { kind: 'rank', rank: 'ambassadeur' },
};
mkdirSync(join(REGISTRY, '..'), { recursive: true });
writeFileSync(REGISTRY, `${JSON.stringify([entry], null, 2)}\n`);
console.log(`pack ${SLUG} : ${thumbs.length} vignettes, contrat ${contract.src}, ${LANGUAGES.length} langues, ${entry.downloadBytes.story} octets`);
