import type { MeeCharacterFeeling, MeeIntent } from './types';

/**
 * CE QU'UN STICKER VEUT DIRE (#9058) — le rangement des onglets de personnages.
 *
 * L'intention se DÉDUIT du sentiment : c'est le cas général, et il évite
 * d'écrire deux fois la même information sur chaque entrée du catalogue. Une
 * entrée la pose à la main quand son geste dit autre chose que son sentiment :
 * « Merci » est de la joie, mais on le cherche à côté de « Bonjour ».
 */

const INTENT_OF_FEELING: Readonly<Record<MeeCharacterFeeling, MeeIntent>> = {
  salut: 'bonjour',
  amour: 'amour',
  timidite: 'amour',
  joie: 'fete',
  celebration: 'fete',
  fierte: 'fete',
  humour: 'fete',
  consolation: 'soutien',
  rejet: 'rale',
  frustration: 'rale',
  colere: 'rale',
  jalousie: 'rale',
  tristesse: 'coup-de-mou',
  fatigue: 'coup-de-mou',
  surprise: 'surprise',
  peur: 'surprise',
  gene: 'surprise',
  quotidien: 'quotidien',
  morbide: 'humour-noir',
};

export const meeIntentOf = (feeling: MeeCharacterFeeling): MeeIntent => INTENT_OF_FEELING[feeling];

/** Les clés du titre et de la phrase d'explication d'une intention, dans le catalogue d'interface. */
export const MEE_INTENT_KEYS = {
  bonjour: { title: 'composer.sticker.intent.bonjour.title', hint: 'composer.sticker.intent.bonjour.hint' },
  amour: { title: 'composer.sticker.intent.amour.title', hint: 'composer.sticker.intent.amour.hint' },
  fete: { title: 'composer.sticker.intent.fete.title', hint: 'composer.sticker.intent.fete.hint' },
  soutien: { title: 'composer.sticker.intent.soutien.title', hint: 'composer.sticker.intent.soutien.hint' },
  rale: { title: 'composer.sticker.intent.rale.title', hint: 'composer.sticker.intent.rale.hint' },
  'coup-de-mou': { title: 'composer.sticker.intent.coup-de-mou.title', hint: 'composer.sticker.intent.coup-de-mou.hint' },
  surprise: { title: 'composer.sticker.intent.surprise.title', hint: 'composer.sticker.intent.surprise.hint' },
  quotidien: { title: 'composer.sticker.intent.quotidien.title', hint: 'composer.sticker.intent.quotidien.hint' },
  'humour-noir': { title: 'composer.sticker.intent.humour-noir.title', hint: 'composer.sticker.intent.humour-noir.hint' },
} as const satisfies Readonly<Record<MeeIntent, { readonly title: string; readonly hint: string }>>;
