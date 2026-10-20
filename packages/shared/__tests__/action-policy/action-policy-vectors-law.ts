/**
 * LE PLAN des vecteurs de la loi des actions (#11205) — la SEULE source écrite à
 * la main. Les attendus se calculent en EXÉCUTANT la loi ; `clientStricter`
 * déclare, verdict par verdict, où le client refuse plus que la passerelle (le
 * test de parité n'y exige alors que l'inclusion).
 *
 * Régénération voulue :
 * `UPDATE_ACTION_POLICY_VECTORS=1 bunx vitest run __tests__/vectors/action-policy.vectors.test.ts`
 * (depuis `packages/shared`). Le même test tombe si le fichier diverge du plan.
 */

import { conversationActionsFor, type ConversationActionInput, type ConversationActions } from '../../utils/conversation-action-policy.js';
import {
  conversationIsEndToEnd,
  messageActionsFor,
  type ActionConversation,
  type ActionViewer,
  type MessageActionInput,
  type MessageActions,
  type MessageActionSubject,
} from '../../utils/message-action-policy.js';
import { messageContentKind } from '../../utils/message-content-kind.js';

export type StricterVerdict = 'edit' | 'delete' | 'react';

export type MessageActionVector = {
  readonly _label: string;
  readonly input: MessageActionInput;
  readonly expected: MessageActions;
  readonly clientStricter?: readonly StricterVerdict[];
};

export type ConversationActionVector = { readonly _label: string; readonly input: ConversationActionInput; readonly expected: ConversationActions };

export const actionPolicyVectorsFormat = (law: string): string =>
  `Générés en EXÉCUTANT ${law} (packages/shared/utils) sur le plan de __tests__/action-policy/action-policy-vectors-law.ts, jamais écrits à la main. { _label, input, expected, clientStricter? } — clientStricter nomme les verdicts (edit, delete, react) où le client refuse plus que la passerelle : le test de parité n'y exige que l'inclusion.`;

const NOW = Date.parse('2026-10-20T12:00:00.000Z');
const HOUR = 3_600_000;
const iso = (ms: number): string => new Date(ms).toISOString();

const viewer = (overrides: Partial<ActionViewer> = {}): ActionViewer => ({
  id: 'user-viewer', participantId: 'part-viewer', hasAccount: true, isAnonymous: false, platformRole: 'USER',
  conversationRole: 'member', isActiveMember: true, canSendMessages: true, isDeclaredMinor: false, ...overrides,
});

const conversation = (overrides: Partial<ActionConversation> = {}): ActionConversation => ({
  type: 'group', encryptionMode: null, isActive: true, closedAt: null, isAnnouncementChannel: false, defaultWriteRole: 'everyone', ...overrides,
});

const message = (overrides: Partial<MessageActionSubject> = {}): MessageActionSubject => ({
  id: '65f000000000000000000001', senderId: 'part-author', authorUserId: 'user-author', content: 'Bonjour à tous',
  messageType: 'text', createdAt: iso(NOW - HOUR), ...overrides,
});

const mine = { senderId: 'part-viewer', authorUserId: 'user-viewer' } as const;
const guest = { id: 'part-guest', participantId: 'part-guest', hasAccount: false, isAnonymous: true, platformRole: null } as const;
const capture = (overrides: Partial<MessageActionSubject> = {}): Partial<MessageActionSubject> => ({
  messageType: 'system', content: 'Zoé a capturé l’éphémère', metadata: { kind: 'content-capture', capturedMessageId: '65f0000000000000000000aa' }, ...overrides,
});
const announcements = { type: 'broadcast', isAnnouncementChannel: true, defaultWriteRole: 'admin' } as const;
const vocal = { content: '', messageType: 'audio', attachments: [{ mimeType: 'audio/m4a' }] } as const;

type MessageCase = readonly [string, Partial<MessageActionSubject>, Partial<ActionConversation>, Partial<ActionViewer>];

const MESSAGE_CASES: readonly MessageCase[] = [
  ['groupe-membre-texte-d-autrui', {}, {}, {}],
  ['groupe-auteur-texte-1h', mine, {}, {}],
  ['groupe-auteur-23h59-encore-modifiable', { ...mine, createdAt: iso(NOW - 24 * HOUR + 60_000) }, {}, {}],
  ['groupe-auteur-24h-pile-encore-modifiable', { ...mine, createdAt: iso(NOW - 24 * HOUR) }, {}, {}],
  ['groupe-auteur-24h01-plus-modifiable', { ...mine, createdAt: iso(NOW - 24 * HOUR - 60_000) }, {}, {}],
  ['groupe-auteur-24h01-moderator-plateforme-sans-fenetre', { ...mine, createdAt: iso(NOW - 24 * HOUR - 60_000) }, {}, { platformRole: 'MODERATOR' }],
  ['groupe-auteur-date-illisible', { ...mine, createdAt: 'pas-une-date' }, {}, {}],
  ['groupe-moderator-plateforme-membre-sur-autrui', {}, {}, { platformRole: 'MODERATOR' }],
  ['groupe-moderator-plateforme-non-membre-retire-sans-modifier', {}, {}, { platformRole: 'MODERATOR', isActiveMember: false, conversationRole: null }],
  ['groupe-role-plateforme-en-minuscules-ne-modere-pas', {}, {}, { platformRole: 'moderator' }],
  ['groupe-ecriture-moderateurs-role-plateforme-en-minuscules-ne-repond-pas', {}, { defaultWriteRole: 'moderator' }, { platformRole: 'moderator' }],
  ['groupe-audit-vaut-user', {}, {}, { platformRole: 'AUDIT' }],
  ['groupe-analyst-vaut-user', {}, {}, { platformRole: 'ANALYST' }],
  ['groupe-role-plateforme-inconnu-ferme', {}, {}, { platformRole: 'PIRATE' }],
  ['groupe-rang-conversation-inconnu-ferme', {}, {}, { conversationRole: 'owner' }],
  ['groupe-rang-en-majuscules-ferme', {}, {}, { conversationRole: 'MODERATOR' }],
  ['chiffrement-serveur-garde-les-services', { ...mine, isEncrypted: true, encryptionMode: 'server' }, { encryptionMode: 'server' }, {}],
  ['groupe-moderator-de-conversation-retire', {}, {}, { conversationRole: 'moderator' }],
  ['groupe-admin-de-conversation-retire', {}, {}, { conversationRole: 'admin' }],
  ['groupe-creator-retire', {}, {}, { conversationRole: 'creator' }],
  ['groupe-admin-de-conversation-parti-ne-retire-plus', {}, {}, { conversationRole: 'admin', isActiveMember: false }],
  ['groupe-moderator-retire-le-message-d-un-invite', { authorUserId: null, senderId: 'part-guest' }, {}, { conversationRole: 'moderator' }],
  ['direct-admin-plateforme-creator-ne-retire-pas', {}, { type: 'direct' }, { platformRole: 'ADMIN', conversationRole: 'creator' }],
  ['direct-auteur-texte', mine, { type: 'direct' }, { conversationRole: 'creator' }],
  ['global-mineur-auteur-ni-modifier-ni-repondre-mais-reagit', mine, { type: 'global' }, { isDeclaredMinor: true }],
  ['global-mineur-reagit-sans-epingler', {}, { type: 'global' }, { isDeclaredMinor: true }],
  ['global-mineur-ne-desepingle-pas', { pinnedAt: iso(NOW - HOUR) }, { type: 'global' }, { isDeclaredMinor: true }],
  ['global-bigboss-membre', {}, { type: 'global' }, { platformRole: 'BIGBOSS' }],
  ['public-membre-texte', {}, { type: 'public' }, {}],
  ['broadcast-membre-reagit-sans-repondre', {}, announcements, {}],
  ['broadcast-admin-repond', {}, announcements, { conversationRole: 'admin' }],
  ['groupe-ecriture-reservee-aux-moderateurs', {}, { defaultWriteRole: 'moderator' }, {}],
  ['groupe-rang-d-ecriture-inconnu-ferme', {}, { defaultWriteRole: 'vip' }, {}],
  ['groupe-clos-auteur', mine, { closedAt: '2026-10-19T00:00:00.000Z' }, {}],
  ['groupe-inactif-auteur', mine, { isActive: false }, {}],
  ['message-epingle-desepingler', { pinnedAt: iso(NOW - HOUR) }, {}, {}],
  ['e2ee-auteur-texte', mine, { encryptionMode: 'e2ee' }, {}],
  ['e2ee-regime-en-majuscules', mine, { encryptionMode: 'E2EE' }, {}],
  ['e2ee-regime-inconnu-ferme', mine, { encryptionMode: 'signal_v3' }, {}],
  ['e2ee-regime-de-message-en-majuscules', { encryptionMode: 'E2EE' }, {}, {}],
  ['e2ee-vocal-d-autrui', vocal, { encryptionMode: 'e2ee' }, {}],
  ['vocal-transcriptible', vocal, {}, {}],
  ['photo-enregistrable', { content: '', messageType: 'image', attachments: [{ mimeType: 'image/jpeg' }] }, {}, {}],
  ['video-vue-unique', { content: '', messageType: 'video', isViewOnce: true, attachments: [{ mimeType: 'video/mp4' }] }, {}, {}],
  ['photo-floutee', { content: '', messageType: 'image', isBlurred: true, attachments: [{ mimeType: 'image/jpeg' }] }, {}, {}],
  ['flamme-a-duree-se-transfere-sans-se-copier', { ephemeralDuration: 30, effectFlags: 1, expiresAt: iso(NOW + 30_000) }, {}, {}],
  ['flamme-apres-lecture-ne-se-transfere-pas', { effectFlags: 1 | 8 }, {}, {}],
  ['ephemere-expire-seul-supprimer-pour-moi', { ephemeralDuration: 30, effectFlags: 1, expiresAt: iso(NOW - 1000) }, {}, {}],
  ['supprime-seul-supprimer-pour-moi', { ...mine, deletedAt: iso(NOW - 60_000) }, {}, { platformRole: 'BIGBOSS' }],
  ['envoi-en-attente', { ...mine, id: 'cid_2b7c1f3e-4a5b-4c6d-8e7f-9a0b1c2d3e4f' }, {}, {}],
  ['envoi-en-echec-reessayer-en-tete', { ...mine, id: 'cid_2b7c1f3e-4a5b-4c6d-8e7f-9a0b1c2d3e4f', failed: true }, {}, {}],
  ['lien-de-l-auteur-plafond-de-six', { ...mine, content: 'Voir https://meeshy.me/a' }, {}, {}],
  ['lieu-ouvrir-dans-plans', { messageType: 'location', content: '12 rue des Lilas' }, {}, {}],
  ['lieu-de-l-auteur-ne-se-modifie-pas', { ...mine, messageType: 'location', content: '12 rue des Lilas' }, {}, {}],
  ['lieu-ecrit-en-texte', { metadata: { location: { name: 'Gare' } }, content: 'Gare de Lyon' }, {}, {}],
  ['carte-de-visite', { content: '', attachments: [{ mimeType: 'text/vcard', originalName: 'zoe.vcf' }] }, {}, {}],
  ['sondage', { content: 'Où dîner ?', metadata: { poll: { options: ['A', 'B'] } } }, {}, {}],
  ['sondage-de-l-auteur-ne-se-modifie-pas', { ...mine, content: 'Où dîner ?', metadata: { poll: { options: ['A', 'B'] } } }, {}, {}],
  ['sticker', { content: '', metadata: { sticker: { templateId: 'coeur' } } }, {}, {}],
  ['plusieurs-pieces', { content: '', attachments: [{ mimeType: 'image/jpeg' }, { mimeType: 'application/pdf' }] }, {}, {}],
  ['resume-d-appel', { messageType: 'system', content: 'Appel manqué', metadata: { kind: 'call', callId: 'c1' } }, {}, {}],
  ['resume-d-appel-ni-retire-par-un-moderateur', { messageType: 'system', content: 'Appel manqué', metadata: { kind: 'call', callId: 'c1' } }, {}, { conversationRole: 'moderator' }],
  ['avis-systeme', { messageType: 'system', content: 'Zoé a rejoint' }, {}, {}],
  ['avis-systeme-par-son-auteur-ne-s-efface-pas-pour-tous', { ...mine, messageType: 'system', content: 'Zoé a rejoint' }, {}, {}],
  ['avis-de-capture-par-son-auteur', capture(mine), {}, {}],
  ['avis-de-capture-retire-par-l-auteur-du-capture', capture({ capturedMessageIsMine: true }), {}, {}],
  ['avis-de-capture-d-autrui', capture(), {}, {}],
  ['avis-de-capture-retire-par-un-moderateur', capture(), {}, { conversationRole: 'moderator' }],
  ['avis-de-capture-en-direct-privilegie-ne-retire-rien', capture({ capturedMessageIsMine: true }), { type: 'direct' }, { conversationRole: 'creator' }],
  ['invite-auteur-de-son-message', { senderId: 'part-guest', authorUserId: null }, {}, guest],
  ['invite-sans-droit-d-envoi', {}, {}, { ...guest, canSendMessages: false }],
  ['inscrit-et-anonyme-se-lit-comme-un-invite', { senderId: 'part-other', authorUserId: 'user-viewer' }, {}, { isAnonymous: true }],
];

const EDITABLE_AT_GATEWAY_ONLY: ReadonlySet<string> = new Set(['location', 'poll', 'sticker']);
const NOTICES: ReadonlySet<string> = new Set(['system', 'call']);

/** Où le client refuse PLUS que la passerelle — déclaré depuis la forme du cas, jamais depuis la sortie de la loi. */
function stricterOf(input: MessageActionInput): readonly StricterVerdict[] {
  const { message: subject, conversation: room, viewer: reader } = input;
  const { kind, flags } = messageContentKind(subject);
  const expired = subject.expiresAt != null && Date.parse(String(subject.expiresAt)) <= input.now;
  const notLive = kind === 'deleted' || expired || flags.optimistic || flags.failed;
  const notice = NOTICES.has(kind);
  const noText = notice || (subject.content ?? '').trim() === '';
  const e2ee = flags.encrypted || conversationIsEndToEnd(room);
  const incoherent = reader.hasAccount && reader.isAnonymous;
  const edit = notLive || noText || e2ee || flags.viewOnce || EDITABLE_AT_GATEWAY_ONLY.has(kind) || incoherent;
  const remove = notLive || (notice && !flags.captureNotice) || incoherent;
  const react = notLive || !reader.canSendMessages;
  return [...(edit ? ['edit' as const] : []), ...(remove ? ['delete' as const] : []), ...(react ? ['react' as const] : [])];
}

export function buildMessageActionVectors(): readonly MessageActionVector[] {
  return MESSAGE_CASES.map(([label, subject, room, reader]) => {
    const input: MessageActionInput = { message: message(subject), conversation: conversation(room), viewer: viewer(reader), now: NOW };
    const clientStricter = stricterOf(input);
    return { _label: label, input, expected: messageActionsFor(input), ...(clientStricter.length > 0 ? { clientStricter } : {}) };
  });
}

const CONVERSATION_TYPES = ['direct', 'group', 'public', 'global', 'broadcast', 'secret'] as const;

const PROFILES: readonly (readonly [string, Partial<ActionViewer>])[] = [
  ['membre', {}],
  ['moderator', { conversationRole: 'moderator' }],
  ['admin', { conversationRole: 'admin' }],
  ['creator', { conversationRole: 'creator' }],
  ['admin-plateforme-membre', { platformRole: 'ADMIN' }],
  ['bigboss-non-membre', { platformRole: 'BIGBOSS', isActiveMember: false, conversationRole: null }],
  ['moderator-plateforme-membre', { platformRole: 'MODERATOR' }],
  ['audit', { platformRole: 'AUDIT' }],
  ['analyst', { platformRole: 'ANALYST' }],
  ['rang-inconnu', { conversationRole: 'owner' }],
  ['invite', guest],
];

const CONVERSATION_EXTRAS: readonly (readonly [string, Partial<ActionConversation>, Partial<ActionViewer>])[] = [
  ['groupe-clos-creator', { closedAt: '2026-10-19T00:00:00.000Z' }, { conversationRole: 'creator' }],
  ['groupe-clos-admin-ne-supprime-plus-pour-tous', { closedAt: '2026-10-19T00:00:00.000Z' }, { conversationRole: 'admin' }],
  ['groupe-inactif-admin-plateforme', { isActive: false }, { platformRole: 'ADMIN' }],
  ['groupe-e2ee-membre', { encryptionMode: 'e2ee' }, {}],
  ['groupe-e2ee-en-majuscules-porte-le-badge', { encryptionMode: 'E2EE' }, {}],
  ['groupe-regime-inconnu-porte-le-badge', { encryptionMode: 'signal_v3' }, {}],
  ['groupe-chiffrement-serveur-sans-badge', { encryptionMode: 'server' }, {}],
  ['groupe-inscrit-et-anonyme-se-lit-comme-un-invite', {}, { isAnonymous: true }],
];

export function buildConversationActionVectors(): readonly ConversationActionVector[] {
  const grid = CONVERSATION_TYPES.flatMap((type) =>
    PROFILES.map(([profile, reader]) => [`${type}-${profile}`, { type }, reader] as const),
  );
  return [...grid, ...CONVERSATION_EXTRAS].map(([label, room, reader]) => {
    const input: ConversationActionInput = { conversation: conversation(room), viewer: viewer(reader) };
    return { _label: label, input, expected: conversationActionsFor(input) };
  });
}
