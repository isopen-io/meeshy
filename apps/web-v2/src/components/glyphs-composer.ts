/* GENERE par scripts/extract-glyphs.mjs depuis @phosphor-icons/core.
 * Ne pas editer a la main : relancer `node scripts/extract-glyphs.mjs`.
 * La liste des glyphes employes vit dans ce script, pas ici.
 * LE JEU D'ECRAN du tiroir du composeur (#5668) : charge avec le chunk composer-tray, jamais dans le socle. */

export const COMPOSER_GLYPHS = {
  stop: { viewBox: "0 0 256 256", body: "<path d=\"M216,56V200a16,16,0,0,1-16,16H56a16,16,0,0,1-16-16V56A16,16,0,0,1,56,40H200A16,16,0,0,1,216,56Z\"/>" },
} as const;

export type ComposerGlyphName = keyof typeof COMPOSER_GLYPHS;
