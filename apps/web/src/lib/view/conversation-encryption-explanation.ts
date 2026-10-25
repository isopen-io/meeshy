import type { ConversationEncryptionCatalogKey } from '@/lib/i18n-conversation-encryption-catalog';

/**
 * **CE QUE LA SECTION « CHIFFREMENT » EXPLIQUE DE LA CONVERSATION OUVERTE**
 * (#12880, directive porteur 2026-10-25) — miroir de
 * `ConversationEncryptionExplanation` (iOS, `apps/ios/Meeshy/Features/Main/Components/`),
 * dont les faits sont relevés dans le code qui les produit : `server` et
 * `hybrid` sont chiffrés par la passerelle avec sa propre clé
 * (`MessageProcessor.getEncryptionContext`), aucun client ne produisant de
 * couche de bout en bout en `hybrid` ; en `e2ee`, la passerelle refuse le clair,
 * les pièces, l'édition et le transfert, et l'aperçu de notification est
 * protégé. Le web ajoute ce qu'il ne sait pas encore faire : lire et écrire en
 * `e2ee` (#10788) — son composeur s'y efface (`write-restriction.ts`).
 *
 * Le bout en bout ne se désactive pas (#12949, décision porteur du
 * 2026-10-25) : la fiche d'une conversation e2ee le dit — avec, pour un
 * groupe, la seule façon de revenir au clair (une nouvelle conversation) ; un
 * tête-à-tête mène à la conversation non chiffrée qui existe à côté de lui
 * (#12966, `PLAINTEXT_DIRECT_KEY`) — et celle d'une conversation que le
 * serveur lit prévient avant d'activer.
 *
 * Toute évolution touche les deux.
 */
export type EncryptionRegime = 'none' | 'server' | 'hybrid' | 'end-to-end';

export type ExplanationTopic = 'whoReads' | 'available' | 'absent' | 'notYet' | 'devices' | 'switching' | 'permanence';

export type ExplanationFact =
  | 'transitProtected' | 'storedWithoutEncryption' | 'encryptedOnServerServerReads' | 'hybridIsServerToday'
  | 'onlyParticipantsRead' | 'everyServerFeature' | 'translatedOnDevice'
  | 'noServerTranscription' | 'noNotificationPreview' | 'noSearch' | 'noEdit' | 'noForward' | 'noOfflineSending'
  | 'webCannotReadYet' | 'notYetAttachments' | 'notYetDecryptedNotifications' | 'notYetGroups' | 'groupSendingUnavailable' | 'notYetSafetyNumbers'
  | 'oneKeyPerDevice' | 'deviceLimit' | 'restoredDeviceIsNew'
  | 'whoMayToggle' | 'switchKeepsHistory' | 'switchIsShownInThread' | 'endToEndIsFinal'
  | 'endToEndNeverTurnedOff' | 'endToEndNeverTurnedOffDirect' | 'serverCannotTurnItOff';

export type ExplanationSection = { readonly topic: ExplanationTopic; readonly facts: readonly ExplanationFact[] };

export type EncryptionExplanation = { readonly regime: EncryptionRegime; readonly sections: readonly ExplanationSection[] };

export function encryptionRegime(mode: string | null | undefined): EncryptionRegime {
  const normalized = (mode ?? '').trim().toLowerCase();
  if (normalized === '') return 'none';
  if (normalized === 'server') return 'server';
  if (normalized === 'hybrid') return 'hybrid';
  return 'end-to-end';
}

const SWITCHING: readonly ExplanationFact[] = ['whoMayToggle', 'switchKeepsHistory', 'switchIsShownInThread', 'endToEndIsFinal'];

const readable = (whoReads: readonly ExplanationFact[]): readonly ExplanationSection[] => [
  { topic: 'whoReads', facts: whoReads },
  { topic: 'available', facts: ['everyServerFeature'] },
  { topic: 'switching', facts: SWITCHING },
];

const endToEnd = (isDirect: boolean): readonly ExplanationSection[] => [
  { topic: 'whoReads', facts: ['onlyParticipantsRead'] },
  { topic: 'available', facts: ['translatedOnDevice'] },
  { topic: 'absent', facts: ['noServerTranscription', 'noNotificationPreview', 'noSearch', 'noEdit', 'noForward', 'noOfflineSending'] },
  {
    topic: 'notYet',
    facts: ['webCannotReadYet', 'notYetAttachments', 'notYetDecryptedNotifications', 'notYetGroups', ...(isDirect ? [] : ['groupSendingUnavailable' as const]), 'notYetSafetyNumbers'],
  },
  { topic: 'devices', facts: ['oneKeyPerDevice', 'deviceLimit', 'restoredDeviceIsNew'] },
  { topic: 'permanence', facts: [isDirect ? 'endToEndNeverTurnedOffDirect' : 'endToEndNeverTurnedOff', 'serverCannotTurnItOff'] },
];

const SECTIONS: Readonly<Record<EncryptionRegime, (isDirect: boolean) => readonly ExplanationSection[]>> = {
  none: () => readable(['transitProtected', 'storedWithoutEncryption']),
  server: () => readable(['transitProtected', 'encryptedOnServerServerReads']),
  hybrid: () => readable(['transitProtected', 'encryptedOnServerServerReads', 'hybridIsServerToday']),
  'end-to-end': endToEnd,
};

export function encryptionExplanation(params: { readonly mode: string | null | undefined; readonly isDirect: boolean }): EncryptionExplanation {
  const regime = encryptionRegime(params.mode);
  return { regime, sections: SECTIONS[regime](params.isDirect) };
}

export const REGIME_SUMMARY_KEY = {
  none: 'conversationEncryption.summary.none',
  server: 'conversationEncryption.summary.server',
  hybrid: 'conversationEncryption.summary.hybrid',
  'end-to-end': 'conversationEncryption.summary.endToEnd',
} as const satisfies Record<EncryptionRegime, ConversationEncryptionCatalogKey>;

export const TOPIC_KEY = {
  whoReads: 'conversationEncryption.topic.whoReads',
  available: 'conversationEncryption.topic.available',
  absent: 'conversationEncryption.topic.absent',
  notYet: 'conversationEncryption.topic.notYet',
  devices: 'conversationEncryption.topic.devices',
  switching: 'conversationEncryption.topic.switching',
  permanence: 'conversationEncryption.topic.permanence',
} as const satisfies Record<ExplanationTopic, ConversationEncryptionCatalogKey>;

export const FACT_KEY = {
  transitProtected: 'conversationEncryption.fact.transitProtected',
  storedWithoutEncryption: 'conversationEncryption.fact.storedWithoutEncryption',
  encryptedOnServerServerReads: 'conversationEncryption.fact.encryptedOnServerServerReads',
  hybridIsServerToday: 'conversationEncryption.fact.hybridIsServerToday',
  onlyParticipantsRead: 'conversationEncryption.fact.onlyParticipantsRead',
  everyServerFeature: 'conversationEncryption.fact.everyServerFeature',
  translatedOnDevice: 'conversationEncryption.fact.translatedOnDevice',
  noServerTranscription: 'conversationEncryption.fact.noServerTranscription',
  noNotificationPreview: 'conversationEncryption.fact.noNotificationPreview',
  noSearch: 'conversationEncryption.fact.noSearch',
  noEdit: 'conversationEncryption.fact.noEdit',
  noForward: 'conversationEncryption.fact.noForward',
  noOfflineSending: 'conversationEncryption.fact.noOfflineSending',
  webCannotReadYet: 'conversationEncryption.fact.webCannotReadYet',
  notYetAttachments: 'conversationEncryption.fact.notYetAttachments',
  notYetDecryptedNotifications: 'conversationEncryption.fact.notYetDecryptedNotifications',
  notYetGroups: 'conversationEncryption.fact.notYetGroups',
  groupSendingUnavailable: 'conversationEncryption.fact.groupSendingUnavailable',
  notYetSafetyNumbers: 'conversationEncryption.fact.notYetSafetyNumbers',
  oneKeyPerDevice: 'conversationEncryption.fact.oneKeyPerDevice',
  deviceLimit: 'conversationEncryption.fact.deviceLimit',
  restoredDeviceIsNew: 'conversationEncryption.fact.restoredDeviceIsNew',
  whoMayToggle: 'conversationEncryption.fact.whoMayToggle',
  switchKeepsHistory: 'conversationEncryption.fact.switchKeepsHistory',
  switchIsShownInThread: 'conversationEncryption.fact.switchIsShownInThread',
  endToEndIsFinal: 'conversationEncryption.fact.endToEndIsFinal',
  endToEndNeverTurnedOff: 'conversationEncryption.fact.endToEndNeverTurnedOff',
  endToEndNeverTurnedOffDirect: 'conversationEncryption.fact.endToEndNeverTurnedOffDirect',
  serverCannotTurnItOff: 'conversationEncryption.fact.serverCannotTurnItOff',
} as const satisfies Record<ExplanationFact, ConversationEncryptionCatalogKey>;

/** Le geste d'un tête-à-tête chiffré de bout en bout : la conversation non chiffrée à côté (#12966). */
export const PLAINTEXT_DIRECT_KEY = {
  open: 'conversationEncryption.plaintextDirect.open',
  busy: 'conversationEncryption.plaintextDirect.busy',
  failed: 'conversationEncryption.plaintextDirect.failed',
  offline: 'conversationEncryption.plaintextDirect.offline',
} as const satisfies Record<string, ConversationEncryptionCatalogKey>;
