/**
 * #10713 — le contour ÉQUIPÉ de l'AUTEUR voyage avec le message : la liste
 * (`GET /conversations/:id/messages`) et `message:new` le servent sous
 * `sender.profileDecor.avatarRing`, la forme de `/me` et de la fiche de
 * conversation. Un auteur absent des participants chargés (au plus 100 dans la
 * fiche) a ainsi le sien dans la bulle. Charge ADDITIVE : sans contour, sans
 * compte, ou contour sorti du registre ⇒ aucune clé. La colonne brute
 * `equippedAvatarRing` ne part jamais.
 *
 * @jest-environment node
 */

import { describe, it, expect } from '@jest/globals';
import fastJsonStringify from 'fast-json-stringify';
import { messageSchema } from '@meeshy/shared/types/api-schemas';

import { buildMessageListSelect, mapMessageRowForList } from '../../../routes/conversations/messages-list-query';
import { buildMessageNewPayload } from '../../../socketio/messageNewPayload';
import { MESSAGE_AUTHOR_USER_SELECT } from '../../../services/messaging/messageAuthorSelect';
import { makeContractMessage } from '../../../socketio/__tests__/helpers/message-new-parity-fixtures';

const RING = { pack: 'contours-essentiels', item: 'filet', origin: 'builtin', contract: null };

const author = (equippedAvatarRing: string | null | undefined) => ({
  id: 'p-ana',
  userId: 'u-ana',
  type: 'user',
  displayName: 'Ana',
  avatar: null,
  user: { id: 'u-ana', username: 'ana', displayName: 'Ana', avatar: null, ...(equippedAvatarRing === undefined ? {} : { equippedAvatarRing }) },
});

const row = (sender: unknown) => ({
  id: 'm1',
  conversationId: 'c1',
  senderId: 'p-ana',
  content: 'salut',
  originalLanguage: 'fr',
  messageType: 'text',
  createdAt: new Date('2026-10-16T10:00:00Z'),
  attachments: [],
  sender,
});

const ctx = {
  includeTranslations: false,
  includeReplies: false,
  hasLanguageFilter: false,
  languageFilter: undefined,
  currentParticipantId: 'reader',
  readStatusMap: new Map(),
  senderPresenceVis: new Map(),
  listMissingEntry: 'hide',
  consumptionMap: new Map(),
  ephemeralDeadlines: new Map(),
} as never;

const serializeListItem = fastJsonStringify(messageSchema as never);
const listed = (sender: unknown) => JSON.parse(serializeListItem(mapMessageRowForList(row(sender) as never, ctx)));

const pushed = (sender: unknown) =>
  buildMessageNewPayload(makeContractMessage({ senderId: 'p-ana', sender }) as never, { conversationId: 'c1', translations: [], attachments: [], replyTo: undefined });

describe('#10713 — liste des messages : le contour de l’auteur', () => {
  it('la requête lit le contour équipé de l’auteur, dans la jointure déjà faite', () => {
    const select = buildMessageListSelect({ includeTranslations: false, includeReplies: false }) as { sender: { select: { user: { select: Record<string, unknown> } } } };
    expect(select.sender.select.user.select).toMatchObject({ equippedAvatarRing: true });
  });

  it('sert sender.profileDecor.avatarRing résolu au registre, jamais la colonne brute', () => {
    const served = listed(author('contours-essentiels/filet'));
    expect(served.sender.profileDecor).toEqual({ avatarRing: RING });
    expect(JSON.stringify(served)).not.toContain('equippedAvatarRing');
  });

  it('aucune clé sans contour, ni pour un contour sorti du registre', () => {
    expect(listed(author(null)).sender).not.toHaveProperty('profileDecor');
    expect(listed(author('disparu/rien')).sender).not.toHaveProperty('profileDecor');
  });

  it('aucune clé pour un auteur sans compte', () => {
    const guest = { id: 'p-guest', userId: null, type: 'anonymous', displayName: 'Invité', avatar: null, user: null };
    expect(listed(guest).sender).not.toHaveProperty('profileDecor');
  });
});

describe('#10713 — message:new : le contour de l’auteur', () => {
  it('la création du message lit le contour équipé de l’auteur', () => {
    expect(MESSAGE_AUTHOR_USER_SELECT).toMatchObject({ equippedAvatarRing: true });
  });

  it('sert sender.profileDecor.avatarRing, jamais la colonne brute', () => {
    const { sender } = pushed(author('contours-essentiels/filet'));
    expect(sender?.profileDecor).toEqual({ avatarRing: RING });
    expect(JSON.stringify(sender)).not.toContain('equippedAvatarRing');
  });

  it('aucune clé sans contour, contour inconnu ou sans compte', () => {
    expect(pushed(author(null)).sender).not.toHaveProperty('profileDecor');
    expect(pushed(author('disparu/rien')).sender).not.toHaveProperty('profileDecor');
    expect(pushed({ ...author(undefined), user: null }).sender).not.toHaveProperty('profileDecor');
  });
});
