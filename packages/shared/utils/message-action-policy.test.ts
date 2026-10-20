import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
  MAX_PRIMARY_ACTIONS,
  MESSAGE_EDIT_WINDOW_MS,
  messageActionsFor,
  type ActionConversation,
  type ActionViewer,
  type MessageActionInput,
  type MessageActionSubject,
} from './message-action-policy';

const NOW = Date.parse('2026-10-20T12:00:00Z');
const HOUR = 60 * 60 * 1000;

const viewer = (overrides: Partial<ActionViewer> = {}): ActionViewer => ({
  id: 'user-viewer', participantId: 'part-viewer', hasAccount: true, isAnonymous: false, platformRole: 'USER',
  conversationRole: 'member', isActiveMember: true, canSendMessages: true, isDeclaredMinor: false, ...overrides,
});

const conversation = (overrides: Partial<ActionConversation> = {}): ActionConversation => ({
  type: 'group', encryptionMode: null, isActive: true, closedAt: null, isAnnouncementChannel: false, defaultWriteRole: 'everyone', ...overrides,
});

const message = (overrides: Partial<MessageActionSubject> = {}): MessageActionSubject => ({
  id: '65f000000000000000000001', senderId: 'part-author', authorUserId: 'user-author', content: 'Bonjour à tous',
  messageType: 'text', createdAt: new Date(NOW - HOUR).toISOString(), ...overrides,
});

const mine = { senderId: 'part-viewer', authorUserId: 'user-viewer' } as const;

const actions = (parts: { message?: Partial<MessageActionSubject>; conversation?: Partial<ActionConversation>; viewer?: Partial<ActionViewer>; now?: number } = {}) =>
  messageActionsFor({
    message: message(parts.message),
    conversation: conversation(parts.conversation),
    viewer: viewer(parts.viewer),
    now: parts.now ?? NOW,
  });

describe('messageActionsFor — les verdicts alignés sur la passerelle (#11205)', () => {
  it('l’auteur modifie à 23 h 59 et plus à 24 h 01', () => {
    const createdAt = new Date(NOW - 24 * HOUR).toISOString();
    expect(actions({ message: { ...mine, createdAt }, now: NOW - 60_000 }).verdicts.edit).toEqual({
      asModerator: false,
      windowEndsAt: Date.parse(createdAt) + MESSAGE_EDIT_WINDOW_MS,
    });
    expect(actions({ message: { ...mine, createdAt }, now: NOW + 60_000 }).verdicts.edit).toBeNull();
  });

  it('un MODERATOR global membre modifie le message d’autrui, au titre de son rôle', () => {
    expect(actions({ viewer: { platformRole: 'MODERATOR' } }).verdicts.edit).toEqual({ asModerator: true, windowEndsAt: null });
  });

  it.each(['AUDIT', 'ANALYST', 'USER', 'PIRATE'])('%s n’a rien de plus qu’un utilisateur', (platformRole) => {
    const { groups, verdicts } = actions({ viewer: { platformRole } });
    expect(verdicts.edit).toBeNull();
    expect(verdicts.remove).toBeNull();
    expect(groups).toEqual(actions({ viewer: { platformRole: 'USER' } }).groups);
  });

  it('un mineur déclaré ne modifie rien dans Global, même son propre message récent', () => {
    expect(actions({ message: mine, conversation: { type: 'global' }, viewer: { isDeclaredMinor: true } }).verdicts.edit).toBeNull();
  });

  it.each([{ isActive: false }, { closedAt: '2026-10-19T00:00:00Z' }])('une conversation terminée (%o) ne laisse pas modifier', (state) => {
    expect(actions({ message: mine, conversation: state }).verdicts.edit).toBeNull();
  });

  it('en E2EE : pas de modification, traduction sur l’appareil, aucun service qui lit le clair', () => {
    const { verdicts } = actions({ message: mine, conversation: { encryptionMode: 'e2ee' } });
    expect(verdicts.edit).toBeNull();
    expect(verdicts.translate).toBe('device');
    expect(verdicts.sentiment).toBeNull();
    expect(verdicts.serverFeatureAbsence).toBe('e2ee-server-feature-absent');
    expect(actions({ message: { content: '', attachments: [{ mimeType: 'audio/m4a' }] }, conversation: { encryptionMode: 'e2ee' } }).verdicts.transcribe).toBeNull();
  });

  it('hors E2EE, la traduction bascule la langue servie', () => {
    expect(actions().verdicts.translate).toBe('served-switch');
  });

  it('on ne signale pas son propre message, ni un message système', () => {
    expect(actions({ message: mine }).verdicts.report).toBe(false);
    expect(actions({ message: { messageType: 'system' } }).verdicts.report).toBe(false);
    expect(actions().verdicts.report).toBe(true);
  });

  it('en direct, aucun tiers ne retire un message, même un ADMIN de plateforme', () => {
    expect(actions({ conversation: { type: 'direct' }, viewer: { platformRole: 'ADMIN', conversationRole: 'creator' } }).verdicts.remove).toBeNull();
    expect(actions({ viewer: { conversationRole: 'moderator' } }).verdicts.remove).toEqual({ reasonRequired: true });
  });

  it('un invité sans droit d’envoi ne répond ni ne réagit', () => {
    const { verdicts, groups } = actions({ viewer: { hasAccount: false, isAnonymous: true, canSendMessages: false } });
    expect([verdicts.canReply, verdicts.canReact]).toEqual([false, false]);
    expect(groups.primary).not.toContain('reply');
  });

  it('dans un canal de diffusion, un membre ne répond pas, un admin du canal si', () => {
    expect(actions({ conversation: { type: 'broadcast', isAnnouncementChannel: true } }).verdicts.canReply).toBe(false);
    expect(actions({ conversation: { type: 'broadcast', isAnnouncementChannel: true }, viewer: { conversationRole: 'admin' } }).verdicts.canReply).toBe(true);
  });

  it('un message supprimé n’offre que « Supprimer pour moi »', () => {
    const { groups } = actions({ message: { deletedAt: '2026-10-20T11:00:00Z' }, viewer: { platformRole: 'BIGBOSS' } });
    expect(groups).toEqual({ primary: [], organize: [], more: [], moderation: [], destructive: ['deleteForMe'] });
  });

  it('un éphémère expiré ne permet plus de réagir', () => {
    expect(actions({ message: { ephemeralDuration: 30, expiresAt: new Date(NOW - 1000).toISOString() } }).verdicts.canReact).toBe(false);
    expect(actions({ message: { ephemeralDuration: 30, expiresAt: new Date(NOW + 1000).toISOString() } }).verdicts.canReact).toBe(true);
  });

  it('un envoi en échec met « Réessayer » en tête', () => {
    expect(actions({ message: { ...mine, id: 'cid_2b7c1f3e-4a5b-4c6d-8e7f-9a0b1c2d3e4f', failed: true } }).groups.primary[0]).toBe('retry');
  });

  it('un lieu s’ouvre dans Plans et son adresse se copie', () => {
    const { primary } = actions({ message: { messageType: 'location', content: '12 rue des Lilas' } }).groups;
    expect(primary.slice(0, 3)).toEqual(['reply', 'openInMaps', 'copyAddress']);
  });

  it('un lien s’ouvre et se copie, une carte de visite s’enregistre, un sondage montre ses résultats', () => {
    expect(actions({ message: { content: 'https://meeshy.me' } }).groups.primary).toEqual(expect.arrayContaining(['openLink', 'copyLink']));
    expect(actions({ message: { content: '', attachments: [{ mimeType: 'text/vcard', originalName: 'z.vcf' }] } }).groups.primary).toContain('saveContact');
    expect(actions({ message: { metadata: { poll: {} } } }).groups.primary).toContain('viewResults');
  });

  it(`la liste primaire tient en ${MAX_PRIMARY_ACTIONS} entrées, Répondre en tête, le reste dans « Plus… »`, () => {
    const { primary, more } = actions({ message: { ...mine, content: 'Voir https://meeshy.me' } }).groups;
    expect(primary[0]).toBe('reply');
    expect(primary.length).toBe(MAX_PRIMARY_ACTIONS);
    expect(more.length).toBeGreaterThan(0);
  });
});

describe('messageActionsFor — ce que la passerelle accorde sans le droit d’écrire, et ce qu’elle refuse en plus', () => {
  it('un mineur déclaré réagit dans Global sans pouvoir y répondre (MINOR_GLOBAL_REFUSAL_MESSAGE)', () => {
    const { verdicts } = actions({ conversation: { type: 'global' }, viewer: { isDeclaredMinor: true } });
    expect([verdicts.canReact, verdicts.canReply]).toEqual([true, false]);
  });

  it('un membre d’un canal d’annonces réagit sans répondre', () => {
    const { verdicts } = actions({ conversation: { type: 'broadcast', isAnnouncementChannel: true } });
    expect([verdicts.canReact, verdicts.canReply]).toEqual([true, false]);
  });

  it('on ne réagit pas dans une conversation close, ni hors membre actif', () => {
    expect(actions({ conversation: { closedAt: '2026-10-19T00:00:00Z' } }).verdicts.canReact).toBe(false);
    expect(actions({ viewer: { isActiveMember: false } }).verdicts.canReact).toBe(false);
  });

  it('un mineur déclaré n’épingle ni ne désépingle dans Global (refusesMinorPin)', () => {
    expect(actions({ conversation: { type: 'global' }, viewer: { isDeclaredMinor: true } }).verdicts.pin).toBeNull();
    expect(actions({ message: { pinnedAt: '2026-10-20T10:00:00Z' }, conversation: { type: 'global' }, viewer: { isDeclaredMinor: true } }).verdicts.pin).toBeNull();
    expect(actions({ conversation: { type: 'global' } }).verdicts.pin).toBe('pin');
  });

  it('un message épinglé propose « Désépingler », jamais « Épingler »', () => {
    const { verdicts, groups } = actions({ message: { pinnedAt: '2026-10-20T10:00:00Z' } });
    expect(verdicts.pin).toBe('unpin');
    expect(groups.organize).toEqual(['unpin']);
    expect(actions().groups.organize).toEqual(['pin']);
  });

  it.each(['E2EE', ' e2ee ', 'signal_v3'])('un régime de conversation %j se lit comme du bout en bout (fermé par défaut)', (encryptionMode) => {
    const { verdicts, groups } = actions({ message: mine, conversation: { encryptionMode } });
    expect(verdicts.forward).toBe(false);
    expect(verdicts.edit).toBeNull();
    expect(verdicts.translate).toBe('device');
    expect(verdicts.sentiment).toBeNull();
    expect(verdicts.serverFeatureAbsence).toBe('e2ee-server-feature-absent');
    expect(groups.primary).not.toContain('forward');
  });

  it('un message au régime « E2EE » sans isEncrypted ne part pas vers le serveur', () => {
    expect(actions({ message: { encryptionMode: 'E2EE' } }).verdicts.forward).toBe(false);
  });

  it('un régime que le serveur lit (server, hybrid) garde les services', () => {
    expect(actions({ conversation: { encryptionMode: 'SERVER' } }).verdicts.translate).toBe('served-switch');
    expect(actions({ conversation: { encryptionMode: 'hybrid' } }).verdicts.serverFeatureAbsence).toBeNull();
  });

  it('un rôle de plateforme en minuscules ne modère pas : la passerelle compare exactement', () => {
    const lower = { platformRole: 'moderator' };
    expect(actions({ viewer: lower }).verdicts.edit).toBeNull();
    expect(actions({ viewer: lower }).verdicts.remove).toBeNull();
    expect(actions({ conversation: { defaultWriteRole: 'moderator' }, viewer: lower }).verdicts.canReply).toBe(false);
    expect(actions({ conversation: { defaultWriteRole: 'moderator' }, viewer: { platformRole: 'MODERATOR' } }).verdicts.canReply).toBe(true);
  });

  it('un avis système ni un résumé d’appel ne se suppriment pour tous ni ne se retirent', () => {
    const notice = actions({ message: { ...mine, messageType: 'system', content: 'Zoé a rejoint' } });
    expect(notice.verdicts.deleteForEveryone).toBe(false);
    expect(notice.groups.destructive).toEqual(['deleteForMe']);
    const call = actions({ message: { messageType: 'system', content: 'Appel manqué', metadata: { kind: 'call', callId: 'c1' } }, viewer: { conversationRole: 'moderator' } });
    expect(call.verdicts.remove).toBeNull();
  });

  it.each<[string, Partial<MessageActionSubject>]>([
    ['un lieu', { messageType: 'location', content: '12 rue des Lilas' }],
    ['un lieu écrit en texte', { metadata: { location: { name: 'Gare' } }, content: 'Gare de Lyon' }],
    ['un sondage', { content: 'Où dîner ?', metadata: { poll: { options: ['A', 'B'] } } }],
    ['un sticker', { content: 'cœur', metadata: { sticker: { templateId: 'coeur' } } }],
  ])('%s ne se modifie pas : son texte n’en porte pas la structure', (_label, shape) => {
    expect(actions({ message: { ...mine, ...shape } }).verdicts.edit).toBeNull();
  });

  it('un lecteur à la fois inscrit et anonyme se lit comme un invité (fermé par défaut)', () => {
    const { verdicts } = actions({ message: { senderId: 'part-other', authorUserId: 'user-viewer' }, viewer: { isAnonymous: true } });
    expect([verdicts.edit, verdicts.deleteForEveryone, verdicts.deleteForMe, verdicts.report, verdicts.pin]).toEqual([null, false, false, false, null]);
  });
});

type ActionVector = { readonly _label: string; readonly input: MessageActionInput; readonly expected: ReturnType<typeof messageActionsFor> };

const vectors: readonly ActionVector[] = JSON.parse(
  readFileSync(fileURLToPath(new URL('../fixtures/action-policy/message-actions.vectors.json', import.meta.url)), 'utf-8'),
).vectors;

describe('vecteurs : message-actions', () => {
  it('le fichier porte des cas, jamais zéro (leçon 257)', () => {
    expect(vectors.length).toBeGreaterThan(20);
  });

  it.each(vectors.map((vector) => [vector._label, vector] as const))('%s', (_label, vector) => {
    expect(messageActionsFor(vector.input)).toEqual(vector.expected);
  });
});
