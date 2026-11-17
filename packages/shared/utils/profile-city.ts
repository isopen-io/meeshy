/**
 * LA VILLE DÉCLARÉE d'une personne, et le cercle qui la lit (#18862, chantier #18857).
 *
 * La ville est une DÉCLARATION (« Dakar »), pas une position : aucune géolocalisation
 * n'y entre. Son propriétaire choisit le cercle à partir duquel elle se lit
 * (`cityCircle`) ; tant qu'il n'a pas choisi (`null`), elle ne part vers personne
 * d'autre que lui. Une valeur de cercle illisible ferme aussi : jamais `PUBLIC` par
 * défaut, comme le ferait la lecture tolérante des ACCORDS (« inconnu » = public) — ici ce
 * serait ouvrir une donnée personnelle sur une donnée corrompue.
 *
 * Le niveau du lecteur n'est pas calculé ici : il vient de la loi d'accès des cercles
 * (`readProfileCircleView(...).level`). Cette fonction ne compare que le plancher choisi.
 */
import { isRelationLevel, relationLevelIfAtLeast, type RelationLevel } from '../types/relation.js';

export const CITY_MAX_LENGTH = 80;

export type CityColumns = {
  readonly city?: string | null;
  readonly cityCircle?: string | null;
};

/** Les cercles qu'une personne peut choisir pour sa ville : toute l'échelle accordable (Atome est réservé). */
export const isCityCircle = (value: unknown): value is RelationLevel => isRelationLevel(value);

/** Texte brut : ni balise, ni caractère de contrôle (un nom de ville n'est pas du balisage). */
export const isPlainCityText = (value: string): boolean => !/[<>\u0000-\u001f\u007f]/.test(value);

/** Rogne ; vide ou `null` = effacement. */
export const normalizeCityInput = (value: string | null | undefined): string | null => {
  const trimmed = (value ?? '').trim();
  return trimmed.length === 0 ? null : trimmed;
};

export const servedCity = (
  row: CityColumns,
  reader: { readonly isSelf: boolean; readonly viewerLevel: RelationLevel },
): string | null => {
  const city = normalizeCityInput(row.city);
  if (city === null) return null;
  if (reader.isSelf) return city;
  if (!isCityCircle(row.cityCircle)) return null;
  return relationLevelIfAtLeast(reader.viewerLevel, row.cityCircle) === null ? null : city;
};
