import type { SafeStorage } from '@/lib/storage';

import {
  CARD_ASPECTS,
  CARD_AUTHOR_PLACEMENTS,
  CARD_HEADER_ORIENTATIONS,
  CARD_TILTS,
  type CardAspect,
  type CardAuthorPlacement,
  type CardHeaderOrientation,
  type CardTilt,
} from './message-card-frame';
import { CARD_AUDIO_STYLES, CARD_MEDIA_STYLES, DEFAULT_AUDIO_STYLE, DEFAULT_MEDIA_STYLE, type CardAudioStyle, type CardMediaStyle } from './message-card-media';
import { DEFAULT_TEMPLATE_ID, parseTemplateId, type MessageCardTemplateId } from './message-card-templates';

/**
 * **LE FORMAT D'UNE CARTE D'EXPORT** — ce que l'exportateur choisit de
 * MONTRER, parmi ce qui existe déjà : le template, le format de l'image, le
 * cadre (onglet Frame), le titre de la conversation, les noms des auteurs (ou
 * leur anonymat, ou leur pseudo), la date, l'heure des messages, et la façon de
 * représenter les médias. L'atelier « Imagine » est un composer simplifié : il
 * ne crée aucun contenu, il choisit l'affichage.
 *
 * L'ANONYMAT se choisit par bloc — l'auteur du message cité, celui de la
 * réponse — et ne touche jamais au filigrane, qui signe toujours la carte du
 * pseudo de qui l'exporte. Le PSEUDO au lieu du nom affiché est un anonymat
 * plus doux : on sait qui parle, par son identifiant public.
 *
 * UN FORMAT PAR DÉFAUT, ENREGISTRÉ SUR L'APPAREIL, sert « Imager rapide » :
 * toute carte suivante part dans ce format, sans passer par les options. Il
 * vit dans le stockage local (une préférence de présentation, aucun
 * contenu), relu et VALIDÉ à chaque lecture : une valeur abîmée retombe sur
 * « aucun défaut », jamais sur une exception ; un défaut enregistré avant
 * l'onglet Frame se relit, complété des réglages par défaut.
 */

export type MessageCardFormat = {
  readonly template: MessageCardTemplateId;
  readonly showConversationTitle: boolean;
  readonly showAuthors: boolean;
  readonly showDate: boolean;
  readonly anonymizeQuoted: boolean;
  readonly anonymizeReply: boolean;
  readonly aspect: CardAspect;
  readonly header: CardHeaderOrientation;
  readonly authorsAt: CardAuthorPlacement;
  readonly tilt: CardTilt;
  readonly showTimes: boolean;
  readonly usePseudonyms: boolean;
  readonly mediaStyle: CardMediaStyle;
  readonly audioStyle: CardAudioStyle;
};

export type MessageCardToggle = 'showConversationTitle' | 'showAuthors' | 'showDate' | 'showTimes' | 'anonymizeQuoted' | 'anonymizeReply' | 'usePseudonyms';

/** Les cinq bascules d'origine : un défaut enregistré les porte toutes, sinon il est abîmé. */
const LEGACY_TOGGLES = ['showConversationTitle', 'showAuthors', 'showDate', 'anonymizeQuoted', 'anonymizeReply'] as const;
const TOGGLES: readonly MessageCardToggle[] = [...LEGACY_TOGGLES, 'showTimes', 'usePseudonyms'];

export const INITIAL_MESSAGE_CARD_FORMAT: MessageCardFormat = {
  template: DEFAULT_TEMPLATE_ID,
  showConversationTitle: false,
  showAuthors: true,
  showDate: false,
  anonymizeQuoted: false,
  anonymizeReply: false,
  aspect: 'auto',
  header: 'horizontal',
  authorsAt: 'top',
  tilt: 'none',
  showTimes: false,
  usePseudonyms: false,
  mediaStyle: DEFAULT_MEDIA_STYLE,
  audioStyle: DEFAULT_AUDIO_STYLE,
};

export const MESSAGE_CARD_FORMAT_KEY = 'meeshy.export.message-card.default-format';

const oneOf = <T extends string>(values: readonly T[], value: unknown, fallback: T): T => values.find((candidate) => candidate === value) ?? fallback;

export function parseMessageCardFormat(raw: string | null): MessageCardFormat | null {
  if (raw === null) return null;
  try {
    const value: unknown = JSON.parse(raw);
    if (typeof value !== 'object' || value === null) return null;
    const record = value as Record<string, unknown>;
    const template = parseTemplateId(record['template']);
    if (template === null || !LEGACY_TOGGLES.every((toggle) => typeof record[toggle] === 'boolean')) return null;
    const flag = (toggle: MessageCardToggle) => record[toggle] === true;
    const initial = INITIAL_MESSAGE_CARD_FORMAT;
    return {
      template,
      showConversationTitle: flag('showConversationTitle'),
      showAuthors: flag('showAuthors'),
      showDate: flag('showDate'),
      anonymizeQuoted: flag('anonymizeQuoted'),
      anonymizeReply: flag('anonymizeReply'),
      showTimes: flag('showTimes'),
      usePseudonyms: flag('usePseudonyms'),
      aspect: oneOf(CARD_ASPECTS, record['aspect'], initial.aspect),
      header: oneOf(CARD_HEADER_ORIENTATIONS, record['header'], initial.header),
      authorsAt: oneOf(CARD_AUTHOR_PLACEMENTS, record['authorsAt'], initial.authorsAt),
      tilt: oneOf(CARD_TILTS, record['tilt'], initial.tilt),
      mediaStyle: oneOf(CARD_MEDIA_STYLES, record['mediaStyle'], initial.mediaStyle),
      audioStyle: oneOf(CARD_AUDIO_STYLES, record['audioStyle'], initial.audioStyle),
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

const CHOICES = ['aspect', 'header', 'authorsAt', 'tilt', 'mediaStyle', 'audioStyle'] as const;

export const sameMessageCardFormat = (a: MessageCardFormat, b: MessageCardFormat | null): boolean =>
  b !== null && a.template === b.template && TOGGLES.every((toggle) => a[toggle] === b[toggle]) && CHOICES.every((choice) => a[choice] === b[choice]);
