/**
 * **UN TEXTE SERVI ÉCHAPPÉ, RENDU À SA LETTRE** (audit 2026-10-04) — la
 * passerelle passe le texte d'une diffusion par `SecuritySanitizer.sanitizeText`
 * (DOMPurify sans balise) : ce qu'elle stocke est la SÉRIALISATION HTML du texte,
 * où « < » est devenu `&lt;` et « & » `&amp;`. Peint tel quel, l'écran montrait
 * « 3 &lt; 5 » ; rouvert dans le formulaire, il se réécrivait en `&amp;lt;`.
 *
 * Ce module ne fait QUE remplacer des entités par leurs caractères : il ne
 * produit jamais de HTML et n'en interprète aucun — le résultat est du texte
 * pur, que React échappe à son tour à l'affichage. Une entité inconnue ou
 * malformée reste telle quelle.
 */
const NAMED: Readonly<Record<string, string>> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
};

const ENTITY = /&(#x[0-9a-f]{1,6}|#[0-9]{1,7}|[a-z]{2,6});/gi;

const fromCodePoint = (code: number): string | null =>
  Number.isInteger(code) && code > 0 && code <= 0x10ffff && !(code >= 0xd800 && code <= 0xdfff) ? String.fromCodePoint(code) : null;

export function decodeHtmlText(text: string): string {
  if (!text.includes('&')) return text;
  return text.replace(ENTITY, (whole, body: string) => {
    const lowered = body.toLowerCase();
    if (lowered.startsWith('#x')) return fromCodePoint(Number.parseInt(lowered.slice(2), 16)) ?? whole;
    if (lowered.startsWith('#')) return fromCodePoint(Number.parseInt(lowered.slice(1), 10)) ?? whole;
    return NAMED[lowered] ?? whole;
  });
}
