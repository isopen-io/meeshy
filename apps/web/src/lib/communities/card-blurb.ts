/**
 * LA DESCRIPTION D'UNE CARTE DE COMMUNAUTÉ (épure #17584, règle 7) — elle sert à
 * reconnaître la communauté, donc elle ne se coupe jamais au milieu d'une
 * phrase : courte, elle se lit entière ; longue, elle s'arrête à la fin de sa
 * dernière phrase qui tient dans la carte, à défaut de sa dernière proposition.
 * Sans aucune pause, elle est rendue telle quelle et la carte la borne à deux
 * lignes.
 */
const CARD_BLURB_ROOM = 44;
const SENTENCE_END = /[.!?…。؟]/u;
const CLAUSE_END = /[,;:،؛—–]/u;

const lastIndexWithin = (text: string, room: number, pause: RegExp): number =>
  [...text.slice(0, room)].reduce((found, character, index) => (pause.test(character) && text[index + 1] === ' ' ? index : found), -1);

export function communityCardBlurb(description: string): string {
  const text = description.trim();
  if (text.length <= CARD_BLURB_ROOM) return text;
  const sentenceEnd = lastIndexWithin(text, CARD_BLURB_ROOM, SENTENCE_END);
  if (sentenceEnd >= 0) return text.slice(0, sentenceEnd + 1);
  const clauseEnd = lastIndexWithin(text, CARD_BLURB_ROOM, CLAUSE_END);
  return clauseEnd >= 0 ? text.slice(0, clauseEnd).trimEnd() : text;
}
