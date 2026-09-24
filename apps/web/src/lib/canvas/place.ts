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
/**
 * L'épingle, en FRACTION de la taille du libellé (`0.82em`, miroir legacy
 * `CanvasV3Scene.tsx:744`) — jamais une taille en PIXELS. La pastille entière
 * est projetée en `cqw` depuis l'espace design 1080 : un glyphe en px y
 * grossissait relativement à mesure que la scène RÉTRÉCIT (14 px contre un
 * libellé de 3,9 px sur une tuile de 100 px de large) et rétrécissait
 * relativement sur un plein écran large (revue-correction #6901). */
export const PLACE_ICON_EM = 0.82;

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
