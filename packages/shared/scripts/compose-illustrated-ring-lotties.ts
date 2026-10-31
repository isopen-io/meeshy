/**
 * Compose les CADRES ILLUSTRÉS d'avatar (#13960) — un anneau fixe de repli et deux films Lottie,
 * `back` derrière l'avatar et `front` au-dessus, qui débordent du contour (`decor.reach`) —
 * en données pures, sans outil de dessin :
 *
 *   cd packages/shared && bun scripts/compose-illustrated-ring-lotties.ts
 *
 * Écrit chaque film adressé par contenu dans `design/appearance/lottie/<sha16>.json`, puis les
 * packs de `illustrated-rings/packs.ts` À LA FIN de `design/appearance/avatar-rings/rings.json`
 * (remplacés s'ils y sont déjà) et leurs noms dans `design/appearance/strings/<langue>.json`.
 * Idempotent : mêmes formules ⇒ mêmes octets ⇒ mêmes adresses. Chaque film passe `validateLottie`,
 * pèse moins de `MAX_FILM_BYTES`, boucle à 30 images par seconde ; chaque contour passe le schéma partagé.
 * La passerelle (`services/gateway/scripts/generate-appearance-packs.ts`) et les copies iOS et
 * Android (`sync-appearance-catalog-{ios,android}.ts`) se régénèrent ensuite.
 */
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseAvatarRingDesign } from '../types/avatar-ring-design.js';
import { validateLottie } from '../utils/lottie-validate.js';
import { REACH } from './illustrated-rings/kit.js';
import { ILLUSTRATED_PACKS, LANGUAGES, type IllustratedPack } from './illustrated-rings/packs.js';

export const MAX_FILM_BYTES = 60 * 1024;

type Ref = { readonly src: string; readonly bytes: number; readonly sha256: string };

export function renderFilm(build: () => unknown, label: string): { readonly bytes: Buffer; readonly ref: Ref } {
  const bytes = Buffer.from(JSON.stringify(build()), 'utf8');
  const verdict = validateLottie(JSON.parse(bytes.toString('utf8')) as unknown, { bytes: bytes.length });
  if (!verdict.ok) throw new Error(`${label} : film refusé (${verdict.reason})`);
  if (bytes.length > MAX_FILM_BYTES) throw new Error(`${label} : ${bytes.length} octets, plus que ${MAX_FILM_BYTES}`);
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  return { bytes, ref: { src: `${sha256.slice(0, 16)}.json`, bytes: bytes.length, sha256 } };
}

export function ringsOf(pack: IllustratedPack, write: (src: string, bytes: Buffer) => void = () => undefined) {
  return pack.frames.map((frame) => {
    const film = (side: 'back' | 'front'): { readonly back?: Ref; readonly front?: Ref } => {
      const build = frame[side];
      if (build === undefined) return {};
      const { bytes, ref } = renderFilm(build, `${frame.key}/${side}`);
      write(ref.src, bytes);
      return { [side]: ref };
    };
    const ring = { key: frame.key, ...frame.still, decor: { reach: REACH, ...film('back'), ...film('front') } };
    if (parseAvatarRingDesign(ring) === null) throw new Error(`${frame.key} : le contour ne passe pas le schéma partagé`);
    return ring;
  });
}

const sourcePack = <R>(pack: IllustratedPack, rings: readonly R[]) => ({
  slug: pack.slug,
  order: pack.order,
  installedByDefault: true,
  removable: true,
  usage: { kind: 'free', surfaces: ['avatar'] },
  rings,
});

/** Les packs illustrés vivent À LA FIN de la source : tout ce qui précède reste à l'octet. */
function withPacks(text: string, packs: readonly unknown[]): string {
  const first = ILLUSTRATED_PACKS[0]!.slug;
  const marker = text.indexOf(`{\n      "slug": "${first}"`);
  const head = marker === -1 ? text.replace(/\n  \]\n\}\n$/, '') : text.slice(0, text.lastIndexOf(',', marker));
  const body = packs.map((pack) => JSON.stringify(pack, null, 2).replace(/^/gm, '    ')).join(',\n');
  return `${head},\n${body}\n  ]\n}\n`;
}

const isMain = process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  const design = resolve(dirname(fileURLToPath(import.meta.url)), '../design/appearance');
  const packs = ILLUSTRATED_PACKS.map((pack) => sourcePack(pack, ringsOf(pack, (src, bytes) => writeFileSync(join(design, 'lottie', src), bytes))));
  const ringsPath = join(design, 'avatar-rings/rings.json');
  writeFileSync(ringsPath, withPacks(readFileSync(ringsPath, 'utf8'), packs));
  for (const language of LANGUAGES) {
    const stringsPath = join(design, `strings/${language}.json`);
    const strings = JSON.parse(readFileSync(stringsPath, 'utf8')) as { packs: Record<string, unknown>; rings: Record<string, string> };
    for (const pack of ILLUSTRATED_PACKS) {
      strings.packs[pack.slug] = pack.names[language];
      for (const frame of pack.frames) strings.rings[frame.key] = frame.names[language];
    }
    writeFileSync(stringsPath, `${JSON.stringify(strings, null, 2)}\n`);
  }
  const summary = packs.flatMap((pack) => pack.rings.map((ring) => ({ key: ring.key, back: ring.decor.back?.bytes, front: ring.decor.front?.bytes })));
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
}
