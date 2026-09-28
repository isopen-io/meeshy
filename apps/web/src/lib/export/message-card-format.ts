import type { SafeStorage } from '@/lib/storage';

import { MESSAGE_CARD_STYLE_IDS, type MessageCardStyleId } from './message-card-style-ids';

/**
 * **LE FORMAT D'UNE CARTE D'EXPORT** — ce que l'exportateur choisit de
 * MONTRER, parmi ce qui existe déjà : le style, le titre de la conversation,
 * les noms des auteurs, la date. La feuille d'export est un composer
 * simplifié : elle ne crée aucun contenu, elle choisit l'affichage.
 *
 * UN FORMAT PAR DÉFAUT, ENREGISTRÉ SUR L'APPAREIL, sert l'« Export rapide » :
 * toute carte suivante part dans ce format, sans passer par les options. Il
 * vit dans le stockage local (une préférence de présentation, aucun
 * contenu), relu et VALIDÉ à chaque lecture : une valeur abîmée ou d'une
 * version antérieure retombe sur « aucun défaut », jamais sur une exception.
 */

export type MessageCardFormat = {
  readonly style: MessageCardStyleId;
  readonly showConversationTitle: boolean;
  readonly showAuthors: boolean;
  readonly showDate: boolean;
};

export const INITIAL_MESSAGE_CARD_FORMAT: MessageCardFormat = {
  style: 'aurore',
  showConversationTitle: false,
  showAuthors: true,
  showDate: false,
};

export const MESSAGE_CARD_FORMAT_KEY = 'meeshy.export.message-card.default-format';

const isStyle = (value: unknown): value is MessageCardStyleId =>
  typeof value === 'string' && (MESSAGE_CARD_STYLE_IDS as readonly string[]).includes(value);

export function parseMessageCardFormat(raw: string | null): MessageCardFormat | null {
  if (raw === null) return null;
  try {
    const value: unknown = JSON.parse(raw);
    if (typeof value !== 'object' || value === null) return null;
    const { style, showConversationTitle, showAuthors, showDate } = value as Record<string, unknown>;
    if (!isStyle(style)) return null;
    if (typeof showConversationTitle !== 'boolean' || typeof showAuthors !== 'boolean' || typeof showDate !== 'boolean') return null;
    return { style, showConversationTitle, showAuthors, showDate };
  } catch {
    return null;
  }
}

export function readDefaultMessageCardFormat(storage: Pick<SafeStorage, 'getItem'>): MessageCardFormat | null {
  return parseMessageCardFormat(storage.getItem(MESSAGE_CARD_FORMAT_KEY));
}

export function writeDefaultMessageCardFormat(storage: Pick<SafeStorage, 'setItem'>, format: MessageCardFormat): void {
  storage.setItem(MESSAGE_CARD_FORMAT_KEY, JSON.stringify(format));
}

export const sameMessageCardFormat = (a: MessageCardFormat, b: MessageCardFormat | null): boolean =>
  b !== null &&
  a.style === b.style &&
  a.showConversationTitle === b.showConversationTitle &&
  a.showAuthors === b.showAuthors &&
  a.showDate === b.showDate;
