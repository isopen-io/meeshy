import type { SafeStorage } from '@/lib/storage';

import { DEFAULT_TEMPLATE_ID, parseTemplateId, type MessageCardTemplateId } from './message-card-templates';

/**
 * **LE FORMAT D'UNE CARTE D'EXPORT** — ce que l'exportateur choisit de
 * MONTRER, parmi ce qui existe déjà : le template, le titre de la
 * conversation, les noms des auteurs (ou leur anonymat), la date. La feuille
 * d'export est un composer simplifié : elle ne crée aucun contenu, elle
 * choisit l'affichage.
 *
 * L'ANONYMAT se choisit par bloc — l'auteur du message cité, celui de la
 * réponse — et ne touche jamais au filigrane, qui signe toujours la carte du
 * pseudo de qui l'exporte.
 *
 * UN FORMAT PAR DÉFAUT, ENREGISTRÉ SUR L'APPAREIL, sert l'« Export rapide » :
 * toute carte suivante part dans ce format, sans passer par les options. Il
 * vit dans le stockage local (une préférence de présentation, aucun
 * contenu), relu et VALIDÉ à chaque lecture : une valeur abîmée ou d'une
 * version antérieure retombe sur « aucun défaut », jamais sur une exception.
 */

export type MessageCardFormat = {
  readonly template: MessageCardTemplateId;
  readonly showConversationTitle: boolean;
  readonly showAuthors: boolean;
  readonly showDate: boolean;
  readonly anonymizeQuoted: boolean;
  readonly anonymizeReply: boolean;
};

export type MessageCardToggle = Exclude<keyof MessageCardFormat, 'template'>;

const TOGGLES: readonly MessageCardToggle[] = ['showConversationTitle', 'showAuthors', 'showDate', 'anonymizeQuoted', 'anonymizeReply'];

export const INITIAL_MESSAGE_CARD_FORMAT: MessageCardFormat = {
  template: DEFAULT_TEMPLATE_ID,
  showConversationTitle: false,
  showAuthors: true,
  showDate: false,
  anonymizeQuoted: false,
  anonymizeReply: false,
};

export const MESSAGE_CARD_FORMAT_KEY = 'meeshy.export.message-card.default-format';

export function parseMessageCardFormat(raw: string | null): MessageCardFormat | null {
  if (raw === null) return null;
  try {
    const value: unknown = JSON.parse(raw);
    if (typeof value !== 'object' || value === null) return null;
    const record = value as Record<string, unknown>;
    const template = parseTemplateId(record['template']);
    if (template === null || !TOGGLES.every((toggle) => typeof record[toggle] === 'boolean')) return null;
    const flag = (toggle: MessageCardToggle) => record[toggle] === true;
    return {
      template,
      showConversationTitle: flag('showConversationTitle'),
      showAuthors: flag('showAuthors'),
      showDate: flag('showDate'),
      anonymizeQuoted: flag('anonymizeQuoted'),
      anonymizeReply: flag('anonymizeReply'),
    };
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
  b !== null && a.template === b.template && TOGGLES.every((toggle) => a[toggle] === b[toggle]);
