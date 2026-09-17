/**
 * LE LIEU D'UNE SCÈNE (#6901, D8) — miroir `StoryLocationLayer.resolvedLabel`
 * (`:79-84`, § 1.6/1.9 de la spécification) : `place.name`, sinon
 * `place.address`, sinon le repli passé par l'appelant (la clé `scene.place.here`
 * localisée, D-13 — la prose de repli est un choix d'ÉCRAN, pas de cette loi
 * pure). Cotes design du gabarit, miroir legacy `CanvasV3Scene.tsx:697-703`.
 */
export const PLACE_FONT_SIZE = 42;
export const PLACE_H_PAD = 22;
export const PLACE_V_PAD = 14;
export const PLACE_ICON_GAP = 10;

export type SharedPlace = { readonly name?: string; readonly address?: string };

const nonEmptyString = (value: unknown): string | undefined => (typeof value === 'string' && value !== '' ? value : undefined);

/** `place` — `null` REJETTE l'objet (§ 1.6 : un lieu sans `payload.place`
 * n'a rien à peindre). */
export function parsePlace(payload: Record<string, unknown>): SharedPlace | null {
  const place = payload.place;
  if (typeof place !== 'object' || place === null) return null;
  const record = place as Record<string, unknown>;
  const name = nonEmptyString(record.name);
  const address = nonEmptyString(record.address);
  return { ...(name !== undefined ? { name } : {}), ...(address !== undefined ? { address } : {}) };
}

export function placeLabel(place: SharedPlace, fallback: string): string {
  return place.name ?? place.address ?? fallback;
}
