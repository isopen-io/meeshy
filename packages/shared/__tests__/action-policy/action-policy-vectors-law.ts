/**
 * LE PLAN des vecteurs de la loi des actions (#11205) — la SEULE source écrite à
 * la main. Les attendus se calculent en EXÉCUTANT la loi ; `clientStricter`
 * déclare, verdict par verdict, où le client refuse plus que la passerelle (le
 * test de parité n'y exige alors que l'inclusion).
 *
 * Régénération voulue (depuis `packages/shared`) : `bun run action-policy-vectors:generate`
 * (`scripts/generate-action-policy-vectors.ts`, `--check` pour vérifier sans écrire).
 * `__tests__/vectors/action-policy.vectors.test.ts` tombe si un fichier diverge du plan.
 */

import { conversationActionsFor, type ConversationActionInput, type ConversationActions } from '../../utils/conversation-action-policy.js';
import {
  conversationIsEndToEnd,
  editContentRefusal,
  messageActionsFor,
  type ActionConversation,
  type ActionViewer,
  type MessageActionInput,
  type MessageActions,
  type MessageActionSubject,
} from '../../utils/message-action-policy.js';
import { messageContentKind } from '../../utils/message-content-kind.js';
import { MESSAGE_EFFECT_FLAGS } from '../../types/message-effect-flags.js';
import { WRITE_PERMISSION_HIERARCHY } from '../../types/role-types.js';

export type StricterVerdict = 'edit' | 'delete' | 'react' | 'pin';

export type MessageActionVector = {
  readonly _label: string;
  readonly input: MessageActionInput;
  readonly expected: MessageActions;
  readonly clientStricter?: readonly StricterVerdict[];
};

export type ConversationActionVector = { readonly _label: string; readonly input: ConversationActionInput; readonly expected: ConversationActions };

export const actionPolicyVectorsFormat = (law: string): string =>
  `Générés en EXÉCUTANT ${law} (packages/shared/utils) sur le plan de __tests__/action-policy/action-policy-vectors-law.ts, jamais écrits à la main. { _label, input, expected, clientStricter? } — clientStricter nomme les verdicts (edit, delete, react, pin) où le client refuse plus que la passerelle : le test de parité n'y exige que l'inclusion.`;

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

const photoOf = (overrides: Partial<MessageActionSubject> = {}): Partial<MessageActionSubject> => ({ content: '', messageType: 'image', attachments: [{ mimeType: 'image/jpeg' }], ...overrides });

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
  ['groupe-admin-plateforme-non-membre-retire-sans-modifier', {}, {}, { platformRole: 'ADMIN', isActiveMember: false, conversationRole: null }],
  ['groupe-role-plateforme-en-minuscules-ne-modere-pas', {}, {}, { platformRole: 'moderator' }],
  ['groupe-ecriture-moderateurs-role-plateforme-en-minuscules-ne-repond-pas', {}, { defaultWriteRole: 'moderator' }, { platformRole: 'moderator' }],
  ['groupe-audit-vaut-user', {}, {}, { platformRole: 'AUDIT' }],
  ['groupe-analyst-vaut-user', {}, {}, { platformRole: 'ANALYST' }],
  ['groupe-role-plateforme-inconnu-ferme', {}, {}, { platformRole: 'PIRATE' }],
  ['groupe-rang-conversation-inconnu-ferme', {}, {}, { conversationRole: 'owner' }],
  ['groupe-rang-en-majuscules-ferme', {}, {}, { conversationRole: 'MODERATOR' }],
  ['chiffrement-serveur-garde-les-services', { ...mine, isEncrypted: true, encryptionMode: 'server' }, { encryptionMode: 'server' }, {}],
  ['serveur-auteur-texte-ne-se-modifie-pas', mine, { encryptionMode: 'server' }, {}],
  ['hybride-moderator-plateforme-ne-modifie-pas', {}, { encryptionMode: 'hybrid' }, { platformRole: 'MODERATOR' }],
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
  ['groupe-ecriture-reservee-aux-membres-le-membre-repond', {}, { defaultWriteRole: 'member' }, {}],
  ['groupe-ecriture-reservee-aux-membres-un-rang-illisible-ne-repond-pas', {}, { defaultWriteRole: 'member' }, { conversationRole: 'owner' }],
  ['groupe-ecriture-reservee-au-createur-un-admin-ne-repond-pas', {}, { defaultWriteRole: 'creator' }, { conversationRole: 'admin' }],
  ['groupe-ecriture-reservee-au-createur-le-createur-repond', {}, { defaultWriteRole: 'creator' }, { conversationRole: 'creator' }],
  ['groupe-clos-auteur', mine, { closedAt: '2026-10-19T00:00:00.000Z' }, {}],
  ['groupe-inactif-auteur', mine, { isActive: false }, {}],
  ['message-epingle-desepingler', { pinnedAt: iso(NOW - HOUR) }, {}, {}],
  ['broadcast-abonne-ne-desepingle-pas', { pinnedAt: iso(NOW - HOUR) }, announcements, {}],
  ['broadcast-moderator-plateforme-epingle', {}, announcements, { platformRole: 'MODERATOR' }],
  ['groupe-ecriture-moderateurs-le-moderateur-epingle', {}, { defaultWriteRole: 'moderator' }, { conversationRole: 'moderator' }],
  ['groupe-clos-ne-desepingle-pas', { pinnedAt: iso(NOW - HOUR) }, { closedAt: '2026-10-19T00:00:00.000Z' }, { conversationRole: 'creator' }],
  ['annonces-sur-un-groupe-l-admin-epingle', {}, { isAnnouncementChannel: true }, { conversationRole: 'admin' }],
  ['e2ee-auteur-texte', mine, { encryptionMode: 'e2ee' }, {}],
  ['e2ee-regime-en-majuscules', mine, { encryptionMode: 'E2EE' }, {}],
  ['e2ee-regime-inconnu-ferme', mine, { encryptionMode: 'signal_v3' }, {}],
  ['e2ee-regime-de-message-en-majuscules', { encryptionMode: 'E2EE' }, {}, {}],
  ['e2ee-vocal-d-autrui', vocal, { encryptionMode: 'e2ee' }, {}],
  ['vocal-transcriptible', vocal, {}, {}],
  ['vocal-en-conversation-serveur-transcriptible', vocal, { encryptionMode: 'server' }, {}],
  ['e2ee-texte-d-autrui-se-traduit-sur-l-appareil', {}, { encryptionMode: 'e2ee' }, {}],
  // #11375 — le modérateur de plateforme modifie le message d'autrui à visage découvert, jamais en bout en bout.
  ['e2ee-moderator-plateforme-ne-modifie-pas-autrui', {}, { encryptionMode: 'e2ee' }, { platformRole: 'MODERATOR' }],
  ['serveur-moderator-plateforme-modifie-autrui', {}, { encryptionMode: 'server' }, { platformRole: 'MODERATOR' }],
  ['serveur-photo-ne-se-transfere-pas', photoOf(), { encryptionMode: 'server' }, {}],
  ['hybride-photo-ne-se-transfere-pas', photoOf(), { encryptionMode: 'hybrid' }, {}],
  ['serveur-photo-chiffree-par-le-message-ne-se-transfere-pas', photoOf({ isEncrypted: true, encryptionMode: 'server' }), {}, {}],
  ['hybride-texte-se-transfere', {}, { encryptionMode: 'hybrid' }, {}],
  ['non-membre-supprimer-pour-moi-refuse', {}, {}, { isActiveMember: false, conversationRole: null }],
  ['membre-actif-supprimer-pour-moi', {}, {}, { isActiveMember: true }],
  ['ancien-membre-supprimer-pour-moi-refuse', {}, {}, { isActiveMember: false }],
  ['ancien-membre-son-propre-message-ne-se-supprime-plus-pour-moi', mine, {}, { isActiveMember: false }],
  ['ancien-membre-message-supprime-ne-se-masque-plus', { deletedAt: iso(NOW - HOUR) }, {}, { isActiveMember: false }],
  ['photo-enregistrable', { content: '', messageType: 'image', attachments: [{ mimeType: 'image/jpeg' }] }, {}, {}],
  ['video-vue-unique', { content: '', messageType: 'video', isViewOnce: true, attachments: [{ mimeType: 'video/mp4' }] }, {}, {}],
  ['photo-floutee', { content: '', messageType: 'image', isBlurred: true, attachments: [{ mimeType: 'image/jpeg' }] }, {}, {}],
  ['photo-vue-unique-par-la-piece-seule', { content: '', messageType: 'image', attachments: [{ mimeType: 'image/jpeg', isViewOnce: true }] }, {}, {}],
  ['photo-vue-unique-par-le-bit-de-la-piece', { content: '', messageType: 'image', attachments: [{ mimeType: 'image/jpeg', effectFlags: MESSAGE_EFFECT_FLAGS.VIEW_ONCE }] }, {}, {}],
  ['deux-pieces-toutes-floutees-se-transferent-sans-s-exporter', { content: '', attachments: [{ mimeType: 'image/jpeg', isBlurred: true }, { mimeType: 'video/mp4', effectFlags: MESSAGE_EFFECT_FLAGS.BLURRED }] }, {}, {}],
  ['une-piece-floutee-sur-deux-s-exporte', { content: '', attachments: [{ mimeType: 'image/jpeg', isBlurred: true }, { mimeType: 'application/pdf' }] }, {}, {}],
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
  ['carte-de-visite-alias-text-x-vcf', { content: '', attachments: [{ mimeType: 'text/x-vcf' }] }, {}, {}],
  ['carte-de-visite-type-generique-extension-en-majuscules', { content: '', attachments: [{ mimeType: 'application/octet-stream', originalName: 'ZOE.VCF' }] }, {}, {}],
  ['carte-de-visite-lue-sur-le-nom-de-fichier-sans-nom-d-origine', { content: '', attachments: [{ mimeType: 'application/octet-stream', fileName: 'zoe.vcard' }] }, {}, {}],
  ['fichier-generique-sans-extension-de-carte', { content: '', attachments: [{ mimeType: 'application/octet-stream', originalName: 'zoe.vcf.zip' }] }, {}, {}],
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

const NOTICES: ReadonlySet<string> = new Set(['system', 'call']);
const WRITE_HIERARCHY_FREE: ReadonlySet<string> = new Set(['direct', 'global']);

/**
 * Où la loi ferme l'écriture que la passerelle laisse ouverte : un rang d'écriture illisible (la loi le lit
 * `creator`, `admitDerivedConversationWrite` le lit `everyone`) et un `broadcast` sans le drapeau d'annonces
 * (la loi le lit comme un canal d'annonces, la passerelle ne lit que le drapeau).
 */
function lawClosesWriting(room: ActionConversation): boolean {
  if (WRITE_HIERARCHY_FREE.has(room.type) || room.isAnnouncementChannel === true) return false;
  const unknownRank = room.defaultWriteRole != null && !(room.defaultWriteRole in WRITE_PERMISSION_HIERARCHY);
  return room.type === 'broadcast' || unknownRank;
}

/** Où le client refuse PLUS que la passerelle — déclaré depuis la forme du cas, jamais depuis la sortie de la loi. */
function stricterOf(input: MessageActionInput): readonly StricterVerdict[] {
  const { message: subject, conversation: room, viewer: reader } = input;
  const { kind, flags } = messageContentKind(subject);
  const expired = subject.expiresAt != null && Date.parse(String(subject.expiresAt)) <= input.now;
  const notLive = kind === 'deleted' || expired || flags.optimistic || flags.failed;
  const notice = NOTICES.has(kind);
  // #12792 — vue unique, message chiffré, avis et formes structurées : la passerelle les refuse AUSSI
  // (`editContentRefusal`), la parité y est donc exacte ; seul un texte vide reste un refus propre au client.
  const noText = editContentRefusal({ kind, flags }) === null && (subject.content ?? '').trim() === '';
  const incoherent = reader.hasAccount && reader.isAnonymous;
  const edit = notLive || noText || conversationIsEndToEnd(room) || incoherent;
  const remove = notLive || (notice && !flags.captureNotice) || incoherent;
  const react = notLive || !reader.canSendMessages;
  const pin = notLive || notice || flags.viewOnce || !reader.hasAccount || reader.isAnonymous || lawClosesWriting(room);
  return [
    ...(edit ? ['edit' as const] : []),
    ...(remove ? ['delete' as const] : []),
    ...(react ? ['react' as const] : []),
    ...(pin ? ['pin' as const] : []),
  ];
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
  ['moderator-plateforme-non-membre', { platformRole: 'MODERATOR', isActiveMember: false, conversationRole: null }],
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
  ['groupe-non-membre-ne-masque-ni-ne-signale', {}, { isActiveMember: false, conversationRole: null }],
  ['groupe-inscrit-et-anonyme-se-lit-comme-un-invite', {}, { isAnonymous: true }],
  ['groupe-rang-de-ligne-en-majuscules-modere', {}, { conversationRole: 'MODERATOR' }],
  ['groupe-createur-en-majuscules-supprime-pour-tous', {}, { conversationRole: 'CREATOR' }],
  ['public-rang-de-ligne-en-majuscules-invite', { type: 'public' }, { conversationRole: 'ADMIN' }],
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

export type ActionPolicyVectorFile = { readonly name: 'message-actions' | 'conversation-actions'; readonly content: string };

/** Le contenu EXACT de chaque fichier de `fixtures/action-policy/`, tel que le plan le produit. */
export function actionPolicyVectorFiles(): readonly ActionPolicyVectorFile[] {
  const render = (law: string, vectors: readonly unknown[]): string =>
    `${JSON.stringify({ $format: actionPolicyVectorsFormat(law), vectors }, null, 2)}\n`;
  return [
    { name: 'message-actions', content: render('messageActionsFor', buildMessageActionVectors()) },
    { name: 'conversation-actions', content: render('conversationActionsFor', buildConversationActionVectors()) },
  ];
}
