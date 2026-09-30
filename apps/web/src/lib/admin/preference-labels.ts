import type {
  ApplicationPreference,
  AudioPreference,
  DocumentPreference,
  MessagePreference,
  NotificationPreference,
  PrivacyPreference,
  VideoPreference,
} from '@meeshy/shared/types/preferences';

import type { AdminPreferenceCategory, AdminPreferenceValue } from '@/lib/api/admin-user-member';
import { translateAdmin, translateAdminMaybe } from '@/lib/i18n-admin-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';

import { languageName, sentenceCase } from './interpret/language';
import { formatBytes, formatCount, formatPercent } from './interpret/numbers';
import { weekdayName } from './interpret/time';
import { formatDays } from './member-meta';

/**
 * **LES PRÉFÉRENCES D'UN MEMBRE, SOUS UN LIBELLÉ** (#7920) — l'onglet Préférences
 * montrait des clés en `font-mono` (`showReadReceipts`, `dndUtcOffsetMinutes`) et
 * des valeurs brutes (`true`, `medium`, `1`). Ici chaque clé des sept catégories a
 * un libellé traduit et sa valeur se DIT : booléen en mots, énumération nommée,
 * nombre avec son unité (vitesse en ×, jours, octets, heures « ne pas déranger »),
 * langues nommées.
 *
 * ## Une table, typée sur les schémas de la passerelle
 *
 * `PREFERENCE_KINDS` est indexée par catégorie PUIS par clé, et son type est
 * dérivé des types des schémas partagés (`keyof PrivacyPreference`…, importés en
 * TYPE seulement : aucune valeur de production ne vient de `@meeshy/shared`). Une
 * clé qu'un schéma gagnera demain ne compile donc plus tant qu'elle n'a pas son
 * genre de valeur ici — et le témoin de ce fichier exige, en plus, son libellé en
 * français. `extras` (le canal de compatibilité ascendante) n'est pas une
 * préférence : il n'est jamais listé.
 *
 * ## Le libellé vient du catalogue, sous une clé DÉRIVÉE
 *
 * `admin.people.pref.<catégorie>.<clé>` — pas de seconde table de 140 chaînes à
 * tenir d'accord avec le fragment. Une clé que ce client ne connaît pas (un schéma
 * plus récent que l'interface) retombe sur un libellé HUMANISÉ (« Show read
 * receipts »), jamais sur la clé brute en `camelCase`.
 */
type Choice =
  | 'encryption'
  | 'transcriptionSource'
  | 'audioQuality'
  | 'cloneQuality'
  | 'clonePreset'
  | 'fontSize'
  | 'textAlign'
  | 'skinTone'
  | 'videoQuality'
  | 'videoResolution'
  | 'frameRate'
  | 'videoCodec'
  | 'audioFormat'
  | 'videoLayout'
  | 'selfViewPosition'
  | 'theme'
  | 'lineHeight'
  | 'sidebarPosition';

type Count = 'fileTypes' | 'tutorials';

export type PreferenceKind =
  | 'flag'
  | 'multiplier'
  | 'decimal'
  | 'days'
  | 'megabytes'
  | 'percent'
  | 'characters'
  | 'kbps'
  | 'clock'
  | 'weekdays'
  | 'utcOffset'
  | 'language'
  | 'languages'
  | 'text'
  | { readonly choice: Choice }
  | { readonly count: Count };

/**
 * `extras` (le canal de compatibilité ascendante) et les cinq consentements `z.never` que le schéma de
 * l'application DÉCLARE pour les REFUSER (#4180) ne sont pas des préférences : ils ne sont jamais listés.
 */
type NotPreferences = 'extras' | 'dataProcessingConsentAt' | 'voiceDataConsentAt' | 'voiceProfileConsentAt' | 'voiceCloningConsentAt' | 'voiceCloningEnabledAt';

type Kinds<T> = Readonly<Record<Exclude<keyof T, NotPreferences>, PreferenceKind>>;

const PRIVACY: Kinds<PrivacyPreference> = {
  showOnlineStatus: 'flag',
  showLastSeen: 'flag',
  showReadReceipts: 'flag',
  showTypingIndicator: 'flag',
  showForwardSource: 'flag',
  allowContactRequests: 'flag',
  allowGroupInvites: 'flag',
  acceptCallsFromNonContacts: 'flag',
  allowCallsFromNonContacts: 'flag',
  saveMediaToGallery: 'flag',
  allowAnalytics: 'flag',
  shareUsageData: 'flag',
  blockScreenshots: 'flag',
  hideProfileFromSearch: 'flag',
  notifyContactsOnReturn: 'flag',
  encryptionPreference: { choice: 'encryption' },
  autoEncryptNewConversations: 'flag',
  showEncryptionStatus: 'flag',
  warnOnUnencrypted: 'flag',
};

const AUDIO: Kinds<AudioPreference> = {
  transcriptionEnabled: 'flag',
  transcriptionSource: { choice: 'transcriptionSource' },
  autoTranscribeIncoming: 'flag',
  audioTranslationEnabled: 'flag',
  translatedAudioFormat: { choice: 'audioFormat' },
  ttsEnabled: 'flag',
  ttsVoice: 'text',
  ttsSpeed: 'multiplier',
  ttsPitch: 'multiplier',
  audioQuality: { choice: 'audioQuality' },
  noiseSuppression: 'flag',
  echoCancellation: 'flag',
  voiceProfileEnabled: 'flag',
  voiceCloneQuality: { choice: 'cloneQuality' },
  voiceCloningExaggeration: 'decimal',
  voiceCloningCfgWeight: 'decimal',
  voiceCloningTemperature: 'decimal',
  voiceCloningTopP: 'decimal',
  voiceCloningQualityPreset: { choice: 'clonePreset' },
};

const MESSAGE: Kinds<MessagePreference> = {
  sendOnEnter: 'flag',
  showFormattingToolbar: 'flag',
  enableMarkdown: 'flag',
  enableEmoji: 'flag',
  emojiSkinTone: { choice: 'skinTone' },
  autoCorrectEnabled: 'flag',
  spellCheckEnabled: 'flag',
  linkPreviewEnabled: 'flag',
  imagePreviewEnabled: 'flag',
  saveDrafts: 'flag',
  draftExpirationDays: 'days',
  defaultFontSize: { choice: 'fontSize' },
  defaultTextAlign: { choice: 'textAlign' },
  autoTranslateIncoming: 'flag',
  autoTranslateLanguages: 'languages',
  maxCharacterLimit: 'characters',
};

const NOTIFICATION: Kinds<NotificationPreference> = {
  pushEnabled: 'flag',
  emailEnabled: 'flag',
  soundEnabled: 'flag',
  vibrationEnabled: 'flag',
  newMessageEnabled: 'flag',
  missedCallEnabled: 'flag',
  callsEnabled: 'flag',
  voicemailEnabled: 'flag',
  systemEnabled: 'flag',
  conversationEnabled: 'flag',
  replyEnabled: 'flag',
  mentionEnabled: 'flag',
  reactionEnabled: 'flag',
  contactRequestEnabled: 'flag',
  groupInviteEnabled: 'flag',
  memberJoinedEnabled: 'flag',
  memberLeftEnabled: 'flag',
  postLikeEnabled: 'flag',
  postCommentEnabled: 'flag',
  postRepostEnabled: 'flag',
  storyReactionEnabled: 'flag',
  commentReplyEnabled: 'flag',
  commentLikeEnabled: 'flag',
  friendContentEnabled: 'flag',
  contactActivityEnabled: 'flag',
  dndEnabled: 'flag',
  dndStartTime: 'clock',
  dndEndTime: 'clock',
  dndDays: 'weekdays',
  dndUtcOffsetMinutes: 'utcOffset',
  showPreview: 'flag',
  showSenderName: 'flag',
  groupNotifications: 'flag',
  notificationBadgeEnabled: 'flag',
};

const VIDEO: Kinds<VideoPreference> = {
  videoQuality: { choice: 'videoQuality' },
  videoBitrate: 'kbps',
  videoFrameRate: { choice: 'frameRate' },
  videoResolution: { choice: 'videoResolution' },
  videoCodec: { choice: 'videoCodec' },
  defaultCamera: 'text',
  mirrorLocalVideo: 'flag',
  videoLayout: { choice: 'videoLayout' },
  showSelfView: 'flag',
  selfViewPosition: { choice: 'selfViewPosition' },
  backgroundBlurEnabled: 'flag',
  virtualBackgroundEnabled: 'flag',
  virtualBackgroundUrl: 'text',
  hardwareAccelerationEnabled: 'flag',
  adaptiveBitrateEnabled: 'flag',
  autoStartVideo: 'flag',
  autoMuteOnJoin: 'flag',
};

const DOCUMENT: Kinds<DocumentPreference> = {
  autoDownloadEnabled: 'flag',
  autoDownloadOnWifi: 'flag',
  autoDownloadMaxSize: 'megabytes',
  downloadPath: 'text',
  inlinePreviewEnabled: 'flag',
  previewPdfEnabled: 'flag',
  previewImagesEnabled: 'flag',
  previewVideosEnabled: 'flag',
  storageQuota: 'megabytes',
  autoDeleteOldFiles: 'flag',
  fileRetentionDays: 'days',
  compressImagesOnUpload: 'flag',
  imageCompressionQuality: 'percent',
  allowedFileTypes: { count: 'fileTypes' },
  scanFilesForMalware: 'flag',
  allowExternalLinks: 'flag',
};

const APPLICATION: Kinds<ApplicationPreference> = {
  theme: { choice: 'theme' },
  accentColor: 'text',
  interfaceLanguage: 'language',
  autoTranslateEnabled: 'flag',
  fontSize: { choice: 'fontSize' },
  fontFamily: 'text',
  lineHeight: { choice: 'lineHeight' },
  compactMode: 'flag',
  sidebarPosition: { choice: 'sidebarPosition' },
  showAvatars: 'flag',
  animationsEnabled: 'flag',
  reducedMotion: 'flag',
  highContrastMode: 'flag',
  screenReaderOptimized: 'flag',
  keyboardShortcutsEnabled: 'flag',
  tutorialsCompleted: { count: 'tutorials' },
  betaFeaturesEnabled: 'flag',
  telemetryEnabled: 'flag',
};

export const PREFERENCE_KINDS: Readonly<Record<AdminPreferenceCategory, Readonly<Record<string, PreferenceKind>>>> = {
  privacy: PRIVACY,
  audio: AUDIO,
  message: MESSAGE,
  notification: NOTIFICATION,
  video: VIDEO,
  document: DOCUMENT,
  application: APPLICATION,
};

/** La clé de catalogue du libellé d'une préférence — dérivée, jamais recopiée. */
export const preferenceLabelKey = (category: AdminPreferenceCategory, key: string): string => `admin.people.pref.${category}.${key}`;

/**
 * « showReadReceipts » → « Show read receipts ». Le repli d'une clé qu'aucun libellé
 * ne nomme : lisible, jamais le `camelCase` brut. Il n'est pas traduit — c'est un
 * repli, pas un libellé.
 */
export function humanizeKey(key: string): string {
  const words = key
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .trim()
    .toLowerCase();
  return words === '' ? key : `${words.charAt(0).toUpperCase()}${words.slice(1)}`;
}

export function preferenceLabel(category: AdminPreferenceCategory, key: string, language: InterfaceLanguage): string {
  return translateAdminMaybe(language, preferenceLabelKey(category, key)) ?? humanizeKey(key);
}

export function preferenceKindOf(category: AdminPreferenceCategory, key: string): PreferenceKind | null {
  return Object.prototype.hasOwnProperty.call(PREFERENCE_KINDS[category], key) ? (PREFERENCE_KINDS[category][key] ?? null) : null;
}

/** Les options d'une énumération fermée, telles que la passerelle les admet — le SEUL endroit qui les énumère côté web. */
export const PREFERENCE_CHOICES: Readonly<Record<Choice, readonly string[]>> = {
  encryption: ['disabled', 'optional', 'always'],
  transcriptionSource: ['auto', 'mobile', 'server'],
  audioQuality: ['low', 'medium', 'high', 'lossless'],
  cloneQuality: ['fast', 'balanced', 'quality'],
  clonePreset: ['fast', 'balanced', 'high_quality'],
  fontSize: ['small', 'medium', 'large'],
  textAlign: ['left', 'center', 'right'],
  skinTone: ['default', 'light', 'medium-light', 'medium', 'medium-dark', 'dark'],
  videoQuality: ['low', 'medium', 'high', 'auto'],
  videoResolution: ['480p', '720p', '1080p', 'auto'],
  frameRate: ['15', '24', '30', '60'],
  videoCodec: ['VP8', 'VP9', 'H264', 'H265', 'AV1'],
  audioFormat: ['mp3', 'wav', 'ogg'],
  videoLayout: ['grid', 'speaker', 'sidebar'],
  selfViewPosition: ['top-left', 'top-right', 'bottom-left', 'bottom-right'],
  theme: ['light', 'dark', 'auto'],
  lineHeight: ['tight', 'normal', 'relaxed', 'loose'],
  sidebarPosition: ['left', 'right'],
};

/** Le NOM d'une option d'énumération — `admin.people.prefValue.<famille>.<option>` — ou son libellé humanisé. */
export function choiceLabel(choice: Choice, option: string, language: InterfaceLanguage): string {
  return translateAdminMaybe(language, `admin.people.prefValue.${choice}.${option}`) ?? sentenceCase(humanizeKey(option).toLowerCase(), language);
}

/** Les options d'une préférence à liste fermée (`null` pour toute autre), nommées. */
export function preferenceOptions(
  category: AdminPreferenceCategory,
  key: string,
  language: InterfaceLanguage,
): readonly { readonly value: string; readonly label: string }[] | null {
  const kind = preferenceKindOf(category, key);
  if (kind === null || typeof kind === 'string' || !('choice' in kind)) return null;
  return PREFERENCE_CHOICES[kind.choice].map((option) => ({ value: option, label: choiceLabel(kind.choice, option, language) }));
}

const WEEKDAY_INDEX: Readonly<Record<string, number>> = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 };

const MEGABYTE = 1_048_576;

const strings = (value: AdminPreferenceValue): readonly string[] => (Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []);

function clockText(value: string, language: InterfaceLanguage): string {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value);
  if (match === null) return value;
  const instant = new Date(Date.UTC(1970, 0, 1, Number(match[1]), Number(match[2])));
  return new Intl.DateTimeFormat(language, { hour: 'numeric', minute: '2-digit', timeZone: 'UTC' }).format(instant);
}

function utcOffsetText(minutes: number): string {
  const sign = minutes < 0 ? '−' : '+';
  const absolute = Math.abs(minutes);
  const hours = String(Math.floor(absolute / 60)).padStart(2, '0');
  const rest = String(absolute % 60).padStart(2, '0');
  return `UTC${sign}${hours}:${rest}`;
}

function decimal(value: number, language: InterfaceLanguage): string {
  return new Intl.NumberFormat(language, { maximumFractionDigits: 2 }).format(value);
}

/**
 * **LA VALEUR D'UNE PRÉFÉRENCE, DITE EN MOTS** (#7920) — jamais `true`, jamais une
 * énumération brute, jamais un nombre sans unité. Une valeur dont le genre est
 * inconnu (clé plus récente que ce client) se dit quand même : booléen en mots,
 * nombre formaté, texte tel quel, liste par son effectif.
 */
export function interpretPreferenceValue(
  category: AdminPreferenceCategory,
  key: string,
  value: AdminPreferenceValue,
  language: InterfaceLanguage,
): string {
  const kind = preferenceKindOf(category, key);

  if (typeof value === 'boolean') return translateAdmin(language, value ? 'admin.people.prefValue.on' : 'admin.people.prefValue.off');
  if (value === null) return translateAdmin(language, 'admin.value.notProvided');

  if (kind !== null && typeof kind === 'object') {
    if ('choice' in kind) return choiceLabel(kind.choice, String(value), language);
    return translateAdmin(language, kind.count === 'fileTypes' ? 'admin.people.prefValue.count.fileTypes' : 'admin.people.prefValue.count.tutorials', {
      count: formatCount(strings(value).length, language),
    });
  }

  if (typeof value === 'number') {
    switch (kind) {
      case 'multiplier':
        return `×${decimal(value, language)}`;
      case 'days':
        return formatDays(value, language);
      case 'megabytes':
        return formatBytes(value * MEGABYTE, language);
      case 'percent':
        return formatPercent(value, 'hundred', language);
      case 'characters':
        return translateAdmin(language, 'admin.people.prefValue.characters', { count: formatCount(value, language) });
      case 'kbps':
        return translateAdmin(language, 'admin.people.prefValue.kbps', { count: formatCount(value, language) });
      case 'utcOffset':
        return utcOffsetText(value);
      default:
        return decimal(value, language);
    }
  }

  if (typeof value === 'string') {
    switch (kind) {
      case 'clock':
        return clockText(value, language);
      case 'language':
        return sentenceCase(languageName(value, language), language);
      default:
        return value === '' ? translateAdmin(language, 'admin.value.notProvided') : value;
    }
  }

  if (Array.isArray(value)) {
    const items = strings(value);
    if (kind === 'weekdays') {
      if (items.length === 0) return translateAdmin(language, 'admin.people.prefValue.everyDay');
      const names = items.flatMap((day) => {
        const index = WEEKDAY_INDEX[day];
        return index === undefined ? [] : [weekdayName(index, language)];
      });
      return new Intl.ListFormat(language, { style: 'long', type: 'conjunction' }).format(names);
    }
    if (kind === 'languages') {
      if (items.length === 0) return translateAdmin(language, 'admin.value.noLanguage');
      return new Intl.ListFormat(language, { style: 'long', type: 'conjunction' }).format(items.map((code) => languageName(code, language)));
    }
    return translateAdmin(language, 'admin.people.prefValue.count.items', { count: formatCount(value.length, language) });
  }

  return translateAdmin(language, 'admin.people.prefValue.structured');
}
