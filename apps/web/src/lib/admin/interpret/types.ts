import type { AdminGlyphName } from '@/components/glyphs-admin';

/**
 * LES TYPES DE LA BIBLIOTHÈQUE D'INTERPRÉTATION (#8876) — ce que « dire une
 * valeur en mots » produit, partagé par le kit et par chaque écran.
 *
 * Un TON n'est jamais la seule information : un badge porte toujours son mot
 * (`label`), et le code brut ne vit que dans `raw`, jamais peint.
 */
export type AdminTone = 'neutral' | 'brand' | 'success' | 'warning' | 'danger' | 'info';

export type Interpreted = {
  readonly label: string;
  readonly tone: AdminTone;
  /** Une phrase quand le sens n'est pas évident, sinon `null`. */
  readonly explain: string | null;
  readonly glyph?: AdminGlyphName;
  /** Le code tel que servi : ancre de test (`data-admin-raw`), jamais affiché. */
  readonly raw: string;
};

export type AdminMoment = {
  readonly iso: string;
  /** « 30 sept. 2026, 14:03 » — date et heure dans la langue d'interface. */
  readonly absolute: string;
  /** « il y a 3 minutes », « demain » — relatif au `now` injecté. */
  readonly relative: string;
  /** « 30 sept. 2026 » — la date seule. */
  readonly date: string;
};
