import { SECTION_BRAND_INK, SECTION_INK, SECTION_INK_2 } from '@/components/grouped-section';

/**
 * **LES ENCRES DU PROFIL PUBLIC, EN UN SEUL ENDROIT** (#7152).
 *
 * Elles vivaient en tête de `user-profile-sections.tsx`, avec les trois
 * familles de composants. Extraire l'en-tête et les états les aurait
 * DUPLIQUÉES — « une chaîne de jeton écrite deux fois diverge au premier
 * réglage de l'une des deux », ce que leur propre commentaire disait déjà.
 */

/* LES TROIS ENCRES VIENNENT DE `grouped-section`, jamais d'un second littéral :
   c'est déjà ce que fait `/me` (`profile-sections.tsx:14-17`), et une chaîne de
   jeton écrite deux fois diverge au premier réglage de l'une des deux. */
export const INK = SECTION_INK;
export const INK_2 = SECTION_INK_2;
export const BRAND = 'var(--color-ios-brand)';
/**
 * LE REMPLISSAGE DE MARQUE EST `--ios-indigo-600`, pas `--color-ios-brand`
 * (#7083) — et c'est une MESURE : l'indigo de marque bascule avec le schéma et
 * rend 4,47 contre le blanc (sous AA, dans les deux schémas), là où l'indigo
 * 600 rend au-delà de 4,5. Même jeton que la pastille de « Découvrir »
 * (`discover-parts.tsx` § `BRAND_FILL`) : un bouton PLEIN se peint avec lui,
 * un bouton de CONTOUR garde l'encre de marque.
 */
export const BRAND_FILL = 'var(--ios-indigo-600)';
export const FOCUS = 'focus-visible:outline-2 focus-visible:outline-offset-2';
/** MÊME encre de marque que « Découvrir » et les titres de section : elle
 * bascule avec le schéma, et c'est elle qui tient AA dans les deux. Elle est
 * IMPORTÉE (`SECTION_BRAND_INK`), pas recopiée — même raison que les encres. */
export const BRAND_INK = SECTION_BRAND_INK;
