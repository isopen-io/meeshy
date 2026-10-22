// Le plan des cibles de fidélité (lot L21a, #10177, prompt § 8.3), sans navigateur : `lib/cible.mjs` le rend.
// L'échantillon versionné sous docs/product/cadres-de-gloire/cible/ est UN cadre par collection, dans la mise en page
// que le contrat lui connaît (chaque cadre en déclare exactement une, `birds.default`), dans les DEUX variantes de
// plaque (`plain` sans message, `message` avec), en 9:16. Le carré n'existe pas : D1 (#10180) tient le 1:1 d'un cadre
// décoré pour la carte simple (`formats.square: null`), le médaillon viendra en lot additif avec sa propre cible.
export const VARIANTS = ['plain', 'message'];

// Le cadre échantillon de chaque collection : l'Ambassadeur I des sept atmosphères, comme la référence L0
// (lib/reference.mjs). Pour les trois autres, un cadre dont Chromium rend deux fois les mêmes octets — un titre en
// dégradé sur chemin courbe (poses-ruban, moments-meesh-100, tresor-reserve-a) ne le fait pas, et une cible doit se
// prouver stable (`stable` dans l'index).
export const SAMPLE_FRAMES = { moments: 'moments-flamme-30', tresor: 'tresor-coffre-a', poses: 'poses-pied' };

export const RENDERED = [1080, 1920];
export const SIZE = [540, 960];

const frameOf = (entry) => entry.file.replace(/\.jpg$/, '');

export function planTargets({ collections, manifests, full = false }) {
  return [...collections].sort().flatMap((collection) => {
    const manifest = manifests[collection];
    if (!manifest) throw new Error(`collection sans manifeste généré : ${collection}`);
    const sample = SAMPLE_FRAMES[collection] ?? `${collection}-ambassadeur-1`;
    const entries = full ? manifest : manifest.filter((entry) => frameOf(entry) === sample);
    if (entries.length === 0) throw new Error(`cadre échantillon absent du manifeste de ${collection} : ${sample}`);
    return entries.flatMap((entry) => VARIANTS.map((variant) => ({ collection, frame: frameOf(entry), layout: entry.layout ?? null, variant, format: 'story' })));
  });
}

export const targetName = ({ frame, variant }) => `${frame}.${variant}.webp`;

// Le rendu 1080×1920 descend à l'échelle de design par la moyenne EXACTE de chaque bloc 2×2, en alpha prémultiplié
// (un pixel vide ne pèse rien, quelle que soit la couleur que Chromium y a laissée), arrondie au plus proche. Un
// peintre qui se juge contre ces cibles applique la même opération à sa propre composition.
export function halve(raw, width, height) {
  if (width % 2 !== 0 || height % 2 !== 0) throw new Error(`halve : largeur et hauteur doivent être paires (${width}×${height})`);
  const w = width / 2;
  const h = height / 2;
  const out = Buffer.alloc(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const corners = [0, 1, width, width + 1].map((d) => ((2 * y) * width + 2 * x + d) * 4);
      const alpha = corners.reduce((acc, p) => acc + raw[p + 3], 0);
      const o = (y * w + x) * 4;
      out[o + 3] = Math.round(alpha / 4);
      if (alpha === 0) continue;
      for (let c = 0; c < 3; c++) out[o + c] = Math.round(corners.reduce((acc, p) => acc + raw[p + c] * raw[p + 3], 0) / alpha);
    }
  }
  return out;
}

export function indexOf({ chromium, sharp, libwebp, photo, targets }) {
  return {
    note: 'Cibles de fidélité du lot L21a (#10177, prompt § 8.3) : un cadre par collection, dans sa mise en page cuite, avec et sans message, rendu par Chromium en 1080×1920 avec la photo fixture, le texte français et la date fixes, puis descendu à l\'échelle de design. Régénérées par `node lib/cible.mjs --generate` ; jamais posées à la main. Rendues sur l\'état courant des cadres (ancres L2, #10153, revalidation du porteur en attente).',
    generator: 'docs/product/cadres-de-gloire/generateur',
    chromium,
    sharp,
    libwebp,
    rendered: RENDERED,
    size: SIZE,
    downsample: 'moyenne 2×2 en alpha prémultiplié, arrondie au plus proche (lib/cible-plan.mjs, halve)',
    encoding: 'WebP sans perte, effort 6',
    photo: { file: 'generateur/fixture/photo.jpg', fit: 'cover', anchor: 'window.box', align: 'center', ...photo },
    formats: { story: true, square: null, squareNote: 'D1 (#10180) : le carré d\'un cadre décoré est la carte simple, `formats.square` est nul ; le médaillon et sa cible viennent en lot additif.' },
    count: targets.length,
    targets: targets.map(({ file, collection, frame, variant, layout, format, window, bytes, sha256, stable }) => ({ file, collection, frame, variant, layout, format, window, bytes, sha256, stable })),
  };
}
