/**
 * LE PLACEHOLDER THUMBHASH (#5893) — le fil est le PREMIER consommateur
 * ThumbHash de tout le dépôt : `grep -rn thumbhash apps/web apps/web-v2
 * packages/shared` (2026-09-13) ne rend AUCUN décodeur, seul iOS en porte un
 * (`CachedAsyncImage.swift:74`, `UIImage.fromThumbHash`). Ce fichier n'en
 * reprend qu'UNE moitié, assumée : la COULEUR MOYENNE, pas la reconstruction
 * basse résolution multi-couleurs complète de l'algorithme (DCT sur les
 * canaux L/P/Q). C'est le sous-ensemble « average RGBA » que la référence
 * publique (evanw/thumbhash) documente elle-même comme fonction séparée —
 * suffisant pour peindre un aplat AVANT toute requête réseau (le critère de
 * fin ne demande qu'un « placeholder ThumbHash », pas la vignette complète),
 * et sans exiger de `<canvas>` — indisponible en test (`bun test`,
 * happy-dom) et dont la sortie diffère d'un moteur à l'autre.
 *
 * LA SORTIE EST UN `data:` URI SVG — un rectangle plein de la couleur
 * moyenne, en `<img src>` direct : aucune requête, aucun canvas, un rendu
 * IDENTIQUE sur les trois plateformes de ce dépôt (Chrome, WKWebView,
 * WebView Android), contrairement à un `<canvas>` dont l'anti-aliasing et
 * l'espace colorimétrique varient.
 *
 * DÉCODAGE — miroir de la fonction `thumbHashToAverageRGBA` de la
 * spécification ThumbHash (Evan Wallace, licence MIT) : les 21 premiers bits
 * du hash portent une luminance moyenne (`l`) et deux canaux chromatiques
 * (`p`, `q`) dans un espace proche de YCoCg, d'où `r`/`g`/`b` se déduisent
 * algébriquement. Le 6ᵉ octet, s'il existe, porte le canal alpha moyen sur
 * son bit de poids fort ET ses sept bits bas.
 */
export type AverageColor = { readonly r: number; readonly g: number; readonly b: number; readonly a: number };

const clamp01 = (value: number): number => Math.max(0, Math.min(1, value));

/**
 * `bytesOfThumbHash` — décode le base64 STANDARD (celui que la passerelle
 * sert, `PostMedia.thumbHash: String`) vers ses octets bruts. `atob` est
 * disponible dans les TROIS runtimes de ce dépôt (Chrome, WKWebView, WebView
 * Android) et sous `bun test` (Bun l'implémente nativement) — aucune
 * dépendance de plus pour une fonction de sept lignes.
 */
function bytesOfThumbHash(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/**
 * `averageColorOfThumbHash` — PURE, rend `null` sur un hash trop court pour
 * porter l'en-tête de 21 bits (moins de 3 octets) plutôt que de lever : un
 * champ mal formé ne doit jamais faire tomber la carte, seulement priver ce
 * média de son aplat (repli sur la teinte de carte, § `thumbHashPlaceholder`).
 */
export function averageColorOfThumbHash(base64: string): AverageColor | null {
  let bytes: Uint8Array;
  try {
    bytes = bytesOfThumbHash(base64);
  } catch {
    return null;
  }
  if (bytes.length < 3) return null;

  const header = (bytes[0] ?? 0) | ((bytes[1] ?? 0) << 8) | ((bytes[2] ?? 0) << 16);
  const l = (header & 63) / 63;
  const p = ((header >> 6) & 63) / 31.5 - 1;
  const q = ((header >> 12) & 63) / 31.5 - 1;

  // Le 6ᵉ octet (indice 5) — présent seulement quand le média porte un canal
  // alpha (une image PNG/WebP transparente) ; sa moitié haute est le drapeau,
  // sa moitié basse la valeur moyenne du canal.
  const alphaByte = bytes[5];
  const hasAlpha = bytes.length > 5 && alphaByte !== undefined && (alphaByte >> 7) !== 0;
  const a = hasAlpha && alphaByte !== undefined ? (alphaByte & 127) / 127 : 1;

  const b = l - (2 / 3) * p;
  const r = (3 * l - b + q) / 2;
  const g = r - q;

  return { r: clamp01(r), g: clamp01(g), b: clamp01(b), a: clamp01(a) };
}

const to255 = (channel: number): number => Math.round(channel * 255);

/** `#rrggbb`, huit chiffres hex si l'alpha n'est pas plein — le format qu'un
 * `fill` SVG accepte directement, sans repasser par `rgba()`. */
export function averageColorToHex(color: AverageColor): string {
  const hex = (value: number): string => to255(value).toString(16).padStart(2, '0');
  const base = `#${hex(color.r)}${hex(color.g)}${hex(color.b)}`;
  return color.a >= 1 ? base : `${base}${hex(color.a)}`;
}

/**
 * `thumbHashPlaceholder` — LE SITE UNIQUE que `FeedPostCard` appelle pour
 * peindre un média AVANT toute requête. `null` (hash absent ou illisible)
 * rend `undefined` : l'appelant retombe alors sur son propre aplat de repli
 * (la teinte de carte), jamais sur un rectangle NOIR ou une chaîne vide —
 * le défaut déjà payé une fois sur les fixtures de story
 * (`fixtures-stories.ts`, doc-comment de `STORY_PHOTO_STAND_IN`).
 */
export function thumbHashPlaceholder(base64: string | undefined): string | undefined {
  if (base64 === undefined || base64 === '') return undefined;
  const color = averageColorOfThumbHash(base64);
  if (color === null) return undefined;
  const fill = averageColorToHex(color);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"><rect width="1" height="1" fill="${fill}"/></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}
