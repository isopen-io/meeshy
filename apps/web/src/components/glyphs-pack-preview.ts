/* GENERE par scripts/extract-glyphs.mjs depuis @phosphor-icons/core.
 * Ne pas editer a la main : relancer `node scripts/extract-glyphs.mjs`.
 * La liste des glyphes employes vit dans ce script, pas ici.
 * LE JEU du plein ecran d'une decoration de la boutique (#16267) : zoom et element suivant, charge avec le plein ecran, jamais dans le socle. */

export const PACK_PREVIEW_GLYPHS = {
  minus: { viewBox: "0 0 256 256", body: "<path d=\"M224,128a8,8,0,0,1-8,8H40a8,8,0,0,1,0-16H216A8,8,0,0,1,224,128Z\"/>" },
  caretRight: { viewBox: "0 0 256 256", body: "<path d=\"M181.66,133.66l-80,80a8,8,0,0,1-11.32-11.32L164.69,128,90.34,53.66a8,8,0,0,1,11.32-11.32l80,80A8,8,0,0,1,181.66,133.66Z\"/>" },
} as const;

export type PackPreviewGlyphName = keyof typeof PACK_PREVIEW_GLYPHS;
