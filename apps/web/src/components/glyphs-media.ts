/* GENERE par scripts/extract-glyphs.mjs depuis @phosphor-icons/core.
 * Ne pas editer a la main : relancer `node scripts/extract-glyphs.mjs`.
 * La liste des glyphes employes vit dans ce script, pas ici.
 * LE JEU D'ECRAN des pieces jointes du fil (#5805) : charge avec attachment-blocks.tsx, jamais dans le socle. */

export const MEDIA_GLYPHS = {
  pause: { viewBox: "0 0 256 256", body: "<path d=\"M216,48V208a16,16,0,0,1-16,16H160a16,16,0,0,1-16-16V48a16,16,0,0,1,16-16h40A16,16,0,0,1,216,48ZM96,32H56A16,16,0,0,0,40,48V208a16,16,0,0,0,16,16H96a16,16,0,0,0,16-16V48A16,16,0,0,0,96,32Z\"/>" },
} as const;

export type MediaGlyphName = keyof typeof MEDIA_GLYPHS;
