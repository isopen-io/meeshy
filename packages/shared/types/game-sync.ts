/**
 * L'ÉTAT DU JEU SE PROPAGE ET S'ORDONNE (#10900) — un appareil qui frappe, gagne ou perd des étincelles met à jour les
 * autres sans attendre, et AUCUNE source plus ancienne ne peut écraser une plus récente.
 *
 * Trois sources servent l'état du jeu à un client, et elles arrivent dans n'importe quel ordre :
 *
 *  - `GET /me/engagement` (le bloc `game`) ;
 *  - la réponse de `POST /me/meesh/mint` ;
 *  - l'événement `game:updated`, poussé dans la room `user:<id>` après une frappe, un gain, une reprise, un prestige
 *    ou une dépense de Meesh.
 *
 * Chacune porte `gameRevision` : la révision de l'état du jeu GRAVÉE sur le compte (#10912) — une horloge logique
 * hybride, `max(instant de la passerelle, révision lue + 1)` posée par chaque écriture du jeu dans la même écriture —
 * lue AVANT l'état servi : toute écriture gravée avant elle y est reflétée. Elle ne recule jamais pour un compte, quelles
 * que soient les horloges des passerelles. Un compte sans révision gravée sert l'instant serveur, comme avant. Un client
 * garde la plus haute révision appliquée et IGNORE toute source dont la révision est strictement plus petite
 * (`shouldApplyGameState`). Une source sans révision (un serveur d'avant) s'applique comme hier.
 */

import { z } from 'zod';
import { nonNegativeInt } from './game-schema-kit.js';
import { gameBlockSchema, type GameBlock } from './game.js';
import { shouldApplyGameState } from './game-sync-order.js';

export { shouldApplyGameState };

/** Ce qui a fait bouger l'état — informatif : le client relit le bloc, quelle que soit la raison. */
export const GAME_UPDATE_REASONS = ['mint', 'credit', 'reclaim', 'prestige', 'spend'] as const;
export type GameUpdateReason = (typeof GAME_UPDATE_REASONS)[number];

/** Le marqueur d'ordre : la révision gravée du compte (millisecondes, horloge logique hybride, #10912), croissante pour un même compte. */
export const gameRevisionSchema = nonNegativeInt;

/**
 * La charge de `game:updated`. `game` est le bloc SERVI tel que `GET /me/engagement` le rendrait au même instant ;
 * `null` quand le serveur n'a pas pu le composer — le client relit alors `GET /me/engagement` (invalidation pure).
 */
export type GameUpdatedEventData = {
  readonly gameRevision: number;
  readonly reason: GameUpdateReason;
  readonly game: GameBlock | null;
};

export const gameUpdatedEventSchema = z.object({
  gameRevision: gameRevisionSchema,
  reason: z.enum(GAME_UPDATE_REASONS),
  game: gameBlockSchema.nullable(),
});
