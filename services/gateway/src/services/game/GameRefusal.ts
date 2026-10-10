/**
 * Un REFUS motivé du jeu (#9376, #9378) : la requête est bien formée, c'est
 * l'ÉTAT du compte qui ne permet pas le geste. Les routes le servent en 409 avec
 * le code du contrat partagé (`GAME_ERROR_CODES`).
 */

import type { GameErrorCode } from '@meeshy/shared/types/game-routes';

export class GameRefusal extends Error {
  constructor(
    readonly code: GameErrorCode,
    readonly details?: Readonly<Record<string, unknown>>,
  ) {
    super(code);
    this.name = 'GameRefusal';
  }
}
