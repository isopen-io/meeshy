import { beforeAll, describe, expect, test } from 'bun:test';

import { MESSAGE_EFFECT_FLAGS } from '@meeshy/shared/types/message-effect-flags';

import { amina, attachmentDefaults, message, translation } from '@/lib/api/fixtures-base';
import type { Attachment, Message } from '@/lib/api/types';
import { loadInterfaceCatalog } from '@/lib/i18n-catalog';

import { discussionCardSubjectOf } from './discussion-card-subject';
import { messageCardSubjectOf } from './message-card-subject';

/**
 * « IMAGER » ET « IMAGER LA DISCUSSION » SOUS LA LOI DE SORTIE (#9573) — une
 * carte est une copie qu'on partage : ce qui disparaît ne s'y peint pas, ni
 * comme sujet, ni comme CITATION d'un message ordinaire, ni comme message
 * d'une discussion.
 */

beforeAll(async () => {
  await loadInterfaceCatalog('fr');
});

const NOW = new Date('2026-10-07T12:00:00.000Z').getTime();
const VIEWER = { id: 'u-jacques', displayName: 'Jacques', handle: 'jacques' };
const { EPHEMERAL, EPHEMERAL_AFTER_READ, VIEW_ONCE } = MESSAGE_EFFECT_FLAGS;

const photo = (overrides: Partial<Attachment> = {}): Attachment => ({
  ...attachmentDefaults,
  id: 'p-1',
  messageId: 'm',
  fileName: 'p.jpg',
  originalName: 'p.jpg',
  mimeType: 'image/jpeg',
  fileSize: 10,
  fileUrl: '/p.jpg',
  width: 800,
  height: 600,
  uploadedBy: 'u-amina',
  createdAt: new Date(NOW).toISOString(),
  ...overrides,
});

const SECRET = 'le secret de la flamme';

const line = (id: string, minute: number, overrides: Partial<Message> = {}): Message =>
  message({
    id,
    senderId: amina.userId ?? 'u-amina',
    sender: amina,
    content: `texte ${id}`,
    originalLanguage: 'fr',
    translations: [],
    effectFlags: 0,
    createdAt: new Date(Date.UTC(2026, 9, 7, 10, minute)),
    ...overrides,
  });

const PROTECTED_NATURES: readonly (readonly [string, Partial<Message>])[] = [
  ['une flamme à durée', { effectFlags: EPHEMERAL, ephemeralDuration: 300 }],
  ['une flamme après lecture', { effectFlags: EPHEMERAL | EPHEMERAL_AFTER_READ }],
  ['un éphémère sans durée lisible', { effectFlags: 0, expiresAt: new Date(NOW + 60_000) }],
  ['une vue unique (bit seul)', { effectFlags: VIEW_ONCE }],
  ['une pièce à vue unique', { attachments: [photo({ id: 'p-once', isViewOnce: true })] }],
];

const QUOTED_NATURES: readonly (readonly [string, Partial<Message>])[] = [
  ...PROTECTED_NATURES,
  ['un message flouté', { isBlurred: true }],
  ['un message chiffré', { isEncrypted: true }],
];

const cardOf = (target: Message) =>
  messageCardSubjectOf({ message: target, servedText: undefined, viewer: VIEWER, readerLanguages: ['fr'], interfaceLanguage: 'fr', now: NOW });

const discussionOf = (messages: readonly Message[], anchorId: string) =>
  discussionCardSubjectOf({ messages, anchorId, servedOf: () => undefined, viewer: VIEWER, now: NOW });

describe('« Imager » — la carte d’un message', () => {
  test('un message ordinaire s’image, avec sa photo', () => {
    const subject = cardOf(line('m1', 1, { attachments: [photo()] }));
    expect(subject?.reply.text).toBe('texte m1');
    expect(subject?.media.map((item) => item.id)).toEqual(['p-1']);
  });

  PROTECTED_NATURES.forEach(([label, nature]) => {
    test(`${label} ne s’image pas`, () => {
      expect(cardOf(line('m1', 1, { content: SECRET, attachments: [photo()], ...nature }))).toBeNull();
    });
  });
});

/**
 * DÉCISION PORTEUR DU 2026-10-08 — une réponse qui cite un contenu protégé
 * (qui disparaît, voilé, chiffré ou de nature non déclarée) ne s'image PAS :
 * la carte entière se refuse, plutôt que de peindre la réponse sans ce
 * qu'elle cite.
 */
describe('un message ordinaire qui CITE un contenu protégé ne s’image pas', () => {
  const quoting = (quoted: Message): Message => line('m-reply', 2, { content: 'ma réponse', replyTo: quoted });

  test('une citation ordinaire, déclarée, se peint avec son média', () => {
    const subject = cardOf(quoting(line('m-q', 1, { content: 'la question', attachments: [photo({ id: 'p-q' })] })));
    expect(subject?.quoted?.text).toBe('la question');
    expect(subject?.media.map((item) => item.id)).toEqual(['p-q']);
  });

  QUOTED_NATURES.forEach(([label, nature]) => {
    test(`citer ${label} : aucune carte`, () => {
      expect(cardOf(quoting(line('m-q', 1, { content: SECRET, attachments: [photo({ id: 'p-q' })], ...nature })))).toBeNull();
    });
  });

  test('une citation dont la nature N’EST PAS DÉCLARÉE (sans `effectFlags`) : aucune carte', () => {
    const undeclared = message({
      id: 'm-q',
      senderId: 'u-amina',
      sender: amina,
      content: SECRET,
      originalLanguage: 'fr',
      translations: [translation('m-q', 'en', 'the flame secret')],
      createdAt: new Date(NOW - 60_000),
      attachments: [photo({ id: 'p-q' })],
    });
    const { effectFlags: _absent, ...bare } = undeclared;
    expect(cardOf(quoting(bare as Message))).toBeNull();
  });

  test('choisir une langue d’export ne rouvre pas la carte', () => {
    const flame = line('m-q', 1, { content: SECRET, translations: [translation('m-q', 'en', 'the flame secret')], effectFlags: EPHEMERAL, ephemeralDuration: 60 });
    expect(messageCardSubjectOf({ message: quoting(flame), servedText: undefined, viewer: VIEWER, readerLanguages: ['fr'], interfaceLanguage: 'fr', now: NOW, language: 'en' })).toBeNull();
  });
});

describe('« Imager la discussion »', () => {
  test('des messages ordinaires se peignent tous', () => {
    const subject = discussionOf([line('m1', 1), line('m2', 2)], 'm2');
    expect([subject?.reply.text, ...(subject?.followUps ?? []).map((part) => part.text)]).toEqual(['texte m1', 'texte m2']);
  });

  PROTECTED_NATURES.forEach(([label, nature]) => {
    test(`${label} choisie ⇒ aucune carte`, () => {
      expect(discussionOf([line('m1', 1), line('m2', 2, nature)], 'm2')).toBeNull();
    });

    test(`${label} DANS la discussion est sautée : ni son texte, ni son média`, () => {
      const subject = discussionOf([line('m1', 1), line('m-x', 2, { content: SECRET, attachments: [photo({ id: 'p-x' })], ...nature }), line('m3', 3)], 'm3');
      expect([subject?.reply.text, ...(subject?.followUps ?? []).map((part) => part.text)]).toEqual(['texte m1', 'texte m3']);
      expect(JSON.stringify(subject)).not.toContain(SECRET);
      expect(JSON.stringify(subject)).not.toContain('p-x');
    });
  });

  QUOTED_NATURES.forEach(([label, nature]) => {
    const quoting = (id: string, minute: number): Message =>
      line(id, minute, { replyTo: line('m-q', 0, { content: SECRET, attachments: [photo({ id: 'p-q' })], ...nature }) });

    test(`choisir une réponse qui cite ${label} ⇒ aucune carte`, () => {
      expect(discussionOf([line('m1', 1), quoting('m2', 2)], 'm2')).toBeNull();
    });

    test(`une réponse qui cite ${label} DANS la discussion ⇒ aucune carte`, () => {
      expect(discussionOf([line('m1', 1), quoting('m2', 2), line('m3', 3)], 'm3')).toBeNull();
    });
  });

  test('une réponse qui cite un contenu protégé HORS des huit derniers messages ne ferme pas la discussion', () => {
    const flame = line('m-q', 0, { content: SECRET, effectFlags: EPHEMERAL, ephemeralDuration: 300 });
    const older = line('m-old', 1, { replyTo: flame });
    const recent = Array.from({ length: 8 }, (_, index) => line(`m${index + 2}`, index + 2));
    const subject = discussionOf([older, ...recent], 'm9');
    expect(subject?.reply.text).toBe('texte m2');
  });
});

