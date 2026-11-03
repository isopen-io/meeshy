/**
 * Pose des packs dans une SOURCE du catalogue d'apparence (`{ "$comment", "packs": [ … ] }`, indentée de deux
 * espaces) sans toucher un octet de ce qui ne leur appartient pas : un pack déjà présent est remplacé À SA
 * PLACE, un pack absent s'ajoute À LA FIN. Deux compositeurs qui écrivent la même source (cadres illustrés,
 * collections Meeshy) se rejouent donc dans n'importe quel ordre sans s'effacer.
 */
const OPEN = '\n    {\n      "slug": ';
const CLOSE = '\n    }';
const TAIL = '\n  ]\n}\n';

const render = (pack: unknown): string => JSON.stringify(pack, null, 2).replace(/^/gm, '    ');

/** Le bloc `{ … }` du pack `slug` : de son `{` (indenté de quatre espaces) à son `}` de même retrait. */
function blockOf(text: string, slug: string): { readonly start: number; readonly end: number } | null {
  const opening = text.indexOf(`${OPEN}${JSON.stringify(slug)}`);
  if (opening === -1) return null;
  const start = opening + 1;
  const closing = text.indexOf(CLOSE, start);
  const after = text[closing + CLOSE.length];
  if (closing === -1 || (after !== ',' && after !== '\n')) throw new Error(`le pack ${slug} n'a pas de fin lisible`);
  return { start, end: closing + CLOSE.length };
}

export function upsertPacks(text: string, packs: readonly { readonly slug: string }[]): string {
  if (!text.endsWith(TAIL)) throw new Error('la source ne finit pas par la liste de packs attendue');
  return packs.reduce((current, pack) => {
    const block = blockOf(current, pack.slug);
    if (block !== null) return `${current.slice(0, block.start)}${render(pack)}${current.slice(block.end)}`;
    return `${current.slice(0, -TAIL.length)},\n${render(pack)}${TAIL}`;
  }, text);
}
