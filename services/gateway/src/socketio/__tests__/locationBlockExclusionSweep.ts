/**
 * LE CLIQUET DE L'EXCLUSION DE BLOCAGE SUR LA POSITION EN DIRECT (#16745).
 *
 * Pourquoi un cliquet, et pas seulement des témoins de comportement : ce qui a
 * laissé `LOCATION_LIVE_*` partir au salon ENTIER pendant toute la vie de la
 * feature n'est pas une erreur de raisonnement — c'est qu'aucun mécanisme
 * n'obligeait à poser la question. Les deux autres signaux du même salon
 * filtraient le blocage, chacun chez soi, et rien ne confrontait le troisième à
 * sa propre famille. Un témoin de comportement garde les cinq sites qui
 * existent ; celui-ci garde le SIXIÈME, celui qu'un lot futur ajoutera.
 *
 * Il relève les émissions de `LOCATION_LIVE_*` adressées à un SALON sans passer
 * par un composeur d'exclusion. `ROOM_EMIT_HELPERS` sont les deux seuls
 * composeurs légitimes : ils posent `.except(...)` quand il y a quelqu'un à
 * exclure, et rendent la chaîne NUE quand il n'y en a pas — c'est ce qui laisse
 * la forme nominale inchangée.
 *
 * Ce qui n'est PAS visé, et pourquoi :
 *
 * - `socket.emit(...)` — une émission à UN socket nommé. Le rattrapage l'emploie
 *   après avoir filtré sa liste sur l'ensemble de l'arrivant ; une exclusion de
 *   salon n'y aurait aucun sens.
 * - `this.io.to(socketId)` — la rétractation CIBLÉE, dont la liste de
 *   destinataires EST l'ensemble des bloqués.
 *
 * Le discriminant est donc la cible, et le relevé la lit : seule une cible qui
 * commence par `ROOMS.` est un salon. Compter « les émissions » tout court
 * mesurerait la popularité d'une méthode, pas une propriété (cycle 107, sept
 * faux positifs, balayage JETÉ plutôt que gelé).
 */

/** Les deux composeurs qui posent l'exclusion — l'un depuis le serveur, l'autre depuis le socket. */
export const ROOM_EMIT_HELPERS = ['_roomExcept', '_fromSocketExcept'] as const;

export type UnguardedRoomEmit = {
  /** La ligne, 1-indexée, telle qu'un éditeur la numérote. */
  readonly line: number;
  /** L'expression de cible, pour que le rouge nomme le site et pas seulement son numéro. */
  readonly target: string;
};

/**
 * Les émissions `LOCATION_LIVE_*` vers un SALON qui ne passent par aucun
 * composeur d'exclusion.
 *
 * La reconnaissance porte sur l'expression ENTIÈRE de l'émission, commentaires
 * dépouillés : une émission s'écrit souvent sur plusieurs lignes, et chercher
 * `.emit(` ligne par ligne manquerait toute chaîne coupée par un retour.
 */
export function sweepUnguardedRoomEmits(source: string): UnguardedRoomEmit[] {
  const stripped = stripComments(source);
  const found: UnguardedRoomEmit[] = [];

  const emitPattern = /([A-Za-z_$][\w$]*(?:\s*\.\s*[A-Za-z_$][\w$]*)*\s*\([^()]*(?:\([^()]*\)[^()]*)*\)(?:\s*\.\s*[A-Za-z_$][\w$]*\s*\([^()]*(?:\([^()]*\)[^()]*)*\))*)\s*\.\s*emit\s*\(\s*SERVER_EVENTS\s*\.\s*LOCATION_LIVE_/g;

  for (let match = emitPattern.exec(stripped); match !== null; match = emitPattern.exec(stripped)) {
    const chain = match[1];
    if (ROOM_EMIT_HELPERS.some(helper => chain.includes(helper))) continue;
    // La cible est l'argument du `.to(...)` le plus proche de l'émission.
    const target = lastToArgument(chain);
    if (target === null) continue;
    if (!/^ROOMS\s*\./.test(target)) continue;
    found.push({ line: lineOf(stripped, match.index), target });
  }

  return found;
}

/**
 * L'argument du dernier `.to(...)` de la chaîne, ou `null` s'il n'y en a pas.
 *
 * Les parenthèses s'ÉQUILIBRENT à la main plutôt que par une expression
 * régulière : la cible nominale est `ROOMS.conversation(id)`, donc un appel
 * imbriqué, et une classe « tout sauf `)` » rend `ROOMS.conversation(id` — une
 * cible tronquée que le rouge afficherait telle quelle, en envoyant chercher
 * une expression qui n'existe pas dans le fichier.
 */
function lastToArgument(chain: string): string | null {
  const opener = chain.lastIndexOf('.to(');
  if (opener === -1) return null;

  let depth = 0;
  for (let i = opener + 3; i < chain.length; i += 1) {
    if (chain[i] === '(') depth += 1;
    else if (chain[i] === ')') {
      depth -= 1;
      if (depth === 0) return chain.slice(opener + 4, i).trim();
    }
  }
  return null;
}

function lineOf(source: string, index: number): number {
  return source.slice(0, index).split('\n').length;
}

/**
 * Les commentaires sont REMPLACÉS PAR DES ESPACES, jamais supprimés : les
 * numéros de ligne du relevé doivent rester ceux du fichier, sans quoi un rouge
 * envoie chercher au mauvais endroit. Les chaînes de caractères sont laissées en
 * place — aucune n'écrit `.emit(SERVER_EVENTS.` dans ce fichier, et un
 * dépouilleur de chaînes qui se trompe coûte plus qu'il ne rapporte.
 */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, block => block.replace(/[^\n]/g, ' '));
}
