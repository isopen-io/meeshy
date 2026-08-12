/**
 * Lecture sûre du `.message` d'une valeur jetée — parité exacte avec
 * l'idiome historique `error.message || fallback` des catch `any` :
 * un objet non-Error porteur d'un `.message` string compte aussi.
 */
export function callErrorMessageOf(error: unknown, fallbackMessage: string): string {
  if (typeof error === 'object' && error !== null && 'message' in error) {
    const message = (error as { message: unknown }).message;
    if (typeof message === 'string' && message) return message;
  }
  return fallbackMessage;
}

/**
 * Convention « CODE: message » des erreurs jetées par CallService, découpée
 * comme les 4 catch historiques (call:initiate/join/leave/end) le faisaient
 * chacun en copie locale : premier deux-points = frontière, le reste est
 * recollé puis trimé. AUCUNE validation de code — les clients (ex. web
 * reconnect-rejoin) gatent sur des codes précis type CALL_ENDED, tout autre
 * message passe tel quel (code == message entier quand il n'y a pas de
 * deux-points). Changer cette forme casserait ces gates.
 */
export function parseCallHandlerError(
  error: unknown,
  fallbackMessage: string
): { code: string; message: string } {
  const errorMessage = callErrorMessageOf(error, fallbackMessage);
  const code = errorMessage.split(':')[0];
  const message = errorMessage.includes(':')
    ? errorMessage.split(':').slice(1).join(':').trim()
    : errorMessage;
  return { code, message };
}
