/**
 * **L'ADRESSE DE LA CARTE D'UNE PERSONNE** (#18881, #20540) — `/positions?person=<id>`, la carte de mes
 * proches posée sur cette personne. Deux chemins y mènent : « Voir sur la carte » de la fiche, et le toucher
 * de l'alerte « un Sang s'approche » (`blood_proximity`). Le paramètre vit ici, hors de tout composant, parce
 * que le résolveur des notifications (`lib/notifications/target.ts`) le lit, et que son jumeau du service
 * worker (`public/sw-push.js`) est tenu égal par `scripts/check-push-target-parity.mjs`.
 */
export const MAP_PERSON_PARAM = 'person';

export const mapHrefOf = (personId: string): string => `/positions?${MAP_PERSON_PARAM}=${encodeURIComponent(personId)}`;
