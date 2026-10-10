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
import {
  CARD_MEDIA_ARRANGEMENTS,
  CARD_MEDIA_LAYOUTS,
  DEFAULT_MEDIA_ARRANGEMENT,
  DEFAULT_MEDIA_LAYOUT,
  LEGACY_MEDIA_STYLES,
  type CardMediaArrangement,
  type CardMediaLayout,
} from './message-card-arrangement';
import { CARD_AUDIO_STYLES, DEFAULT_AUDIO_STYLE, type CardAudioStyle } from './message-card-media';
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
 *
 * LES MÉDIAS (#9236) : leur PLACE (`mediaLayout`), leur DISPOSITION
 * (`mediaArrangement`) et le nom de qui les a postés (`showsMediaAuthor`) —
 * les clés et les valeurs d'iOS (`MessageCardFormat.swift`). Une disposition
 * d'avant (`mediaStyle`) se relit au-dessus de la réponse ; l'ancienne
 * POSITION « mosaic » d'iOS aussi, en mosaïque. Le visuel CHOISI ne s'enregistre
 * pas : il est propre à un contenu.
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
  readonly mediaLayout: CardMediaLayout;
  readonly mediaArrangement: CardMediaArrangement;
  readonly showsMediaAuthor: boolean;
  readonly audioStyle: CardAudioStyle;
};

export type MessageCardToggle = 'showConversationTitle' | 'showAuthors' | 'showDate' | 'showTimes' | 'anonymizeQuoted' | 'anonymizeReply' | 'usePseudonyms' | 'showsMediaAuthor';

/** Les cinq bascules d'origine : un défaut enregistré les porte toutes, sinon il est abîmé. */
const LEGACY_TOGGLES = ['showConversationTitle', 'showAuthors', 'showDate', 'anonymizeQuoted', 'anonymizeReply'] as const;
const TOGGLES: readonly MessageCardToggle[] = [...LEGACY_TOGGLES, 'showTimes', 'usePseudonyms', 'showsMediaAuthor'];

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
  mediaLayout: DEFAULT_MEDIA_LAYOUT,
  mediaArrangement: DEFAULT_MEDIA_ARRANGEMENT,
  showsMediaAuthor: false,
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
    const legacyStyle = record['mediaStyle'];
    const iosLegacyMosaic = record['mediaLayout'] === 'mosaic';
    const legacyArrangement = typeof legacyStyle === 'string' ? LEGACY_MEDIA_STYLES[legacyStyle] : undefined;
    return {
      template,
      showConversationTitle: flag('showConversationTitle'),
      showAuthors: flag('showAuthors'),
      showDate: flag('showDate'),
      anonymizeQuoted: flag('anonymizeQuoted'),
      anonymizeReply: flag('anonymizeReply'),
      showTimes: flag('showTimes'),
      usePseudonyms: flag('usePseudonyms'),
      showsMediaAuthor: flag('showsMediaAuthor'),
      aspect: oneOf(CARD_ASPECTS, record['aspect'], initial.aspect),
      header: oneOf(CARD_HEADER_ORIENTATIONS, record['header'], initial.header),
      authorsAt: oneOf(CARD_AUTHOR_PLACEMENTS, record['authorsAt'], initial.authorsAt),
      tilt: oneOf(CARD_TILTS, record['tilt'], initial.tilt),
      mediaLayout: oneOf(CARD_MEDIA_LAYOUTS, record['mediaLayout'], initial.mediaLayout),
      mediaArrangement: oneOf(CARD_MEDIA_ARRANGEMENTS, record['mediaArrangement'], iosLegacyMosaic ? 'mosaic' : (legacyArrangement ?? initial.mediaArrangement)),
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

const CHOICES = ['aspect', 'header', 'authorsAt', 'tilt', 'mediaLayout', 'mediaArrangement', 'audioStyle'] as const;

export const sameMessageCardFormat = (a: MessageCardFormat, b: MessageCardFormat | null): boolean =>
  b !== null && a.template === b.template && TOGGLES.every((toggle) => a[toggle] === b[toggle]) && CHOICES.every((choice) => a[choice] === b[choice]);
