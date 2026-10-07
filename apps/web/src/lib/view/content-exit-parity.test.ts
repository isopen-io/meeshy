import { beforeAll, describe, expect, test } from 'bun:test';

import { MESSAGE_EFFECT_FLAGS } from '@meeshy/shared/types/message-effect-flags';

import { attachmentDefaults, message } from '@/lib/api/fixtures-base';
import type { Attachment, Message } from '@/lib/api/types';
import { discussionCardSubjectOf } from '@/lib/export/discussion-card-subject';
import { messageCardSubjectOf } from '@/lib/export/message-card-subject';
import { loadInterfaceCatalog } from '@/lib/i18n-catalog';

import { citesSealed, contentExitOf, exitOffers, mediaLeaves, messageExitOffers, quotedExitOf, sealedProps, EXIT_ACTIONS } from './content-exit';
import { forwardRefusalOf, forwardRequestOf } from './forward';
import { forwardMenuItems, imageableOf, messageMenuContextOf, messageMenuItems } from './message-actions';
import { SEALED_ROW_ATTRIBUTE } from './sealed-exit-guard';
import { attachmentSendRequest, mediaPageOffers } from './viewer-page-offers';

/**
 * LA PARITÉ (#9573) — sur chaque combinaison message × pièce, TOUTES les
 * fonctions exportées de `content-exit.ts` et TOUS leurs consommateurs (menu,
 * « Plus… », visionneuse, cartes, sceau, feuille d'envoi) disent la même chose :
 * aucune ne dit « sort » quand une autre dit « ne sort pas ».
 */
beforeAll(async () => {
  await loadInterfaceCatalog('fr');
});

const NOW = new Date('2026-10-07T12:00:00.000Z').getTime();
const VIEWER = { id: 'u-moi', displayName: 'Moi' };
const { EPHEMERAL, EPHEMERAL_AFTER_READ, VIEW_ONCE, BLURRED } = MESSAGE_EFFECT_FLAGS;
const later = new Date(NOW + 60_000);

const MESSAGES: Readonly<Record<string, Partial<Message>>> = {
  'ordinaire': { effectFlags: 0 },
  'ordinaire sans effectFlags': {},
  'flamme à durée': { effectFlags: EPHEMERAL, ephemeralDuration: 300 },
  'flamme à durée (durée seule)': { ephemeralDuration: 300 },
  'après lecture': { effectFlags: EPHEMERAL | EPHEMERAL_AFTER_READ },
  'copie transférée': { effectFlags: EPHEMERAL | EPHEMERAL_AFTER_READ, ephemeralDuration: 60 },
  'vue unique (colonne)': { isViewOnce: true },
  'vue unique (bit)': { effectFlags: VIEW_ONCE },
  'éphémère sans durée (bit)': { effectFlags: EPHEMERAL },
  'éphémère sans durée (échéance)': { expiresAt: later },
  'flouté (colonne)': { isBlurred: true },
  'flouté (bit seul)': { effectFlags: BLURRED },
  'chiffré': { isEncrypted: true },
  'supprimé': { deletedAt: new Date(NOW - 1) },
  'échu': { effectFlags: EPHEMERAL, ephemeralDuration: 30, expiresAt: new Date(NOW - 1) },
};

const PIECES: Readonly<Record<string, Partial<Attachment> | null>> = {
  'sans pièce': null,
  'pièce ordinaire': {},
  'pièce vue unique (colonne)': { isViewOnce: true },
  'pièce vue unique (bit)': { effectFlags: VIEW_ONCE } as Partial<Attachment>,
  'pièce après lecture (bit)': { effectFlags: EPHEMERAL | EPHEMERAL_AFTER_READ } as Partial<Attachment>,
  'pièce éphémère (bit)': { effectFlags: EPHEMERAL } as Partial<Attachment>,
  'pièce floutée (colonne)': { isBlurred: true },
  'pièce floutée (bit)': { effectFlags: BLURRED } as Partial<Attachment>,
  'pièce chiffrée': { isEncrypted: true },
};

const pieceOf = (partial: Partial<Attachment>): Attachment => ({
  ...attachmentDefaults,
  id: 'p-1',
  messageId: '65f0a1b2c3d4e5f6a7b8c9d0',
  fileName: 'p.jpg',
  originalName: 'p.jpg',
  mimeType: 'image/jpeg',
  fileSize: 10,
  fileUrl: '/p.jpg',
  width: 10,
  height: 10,
  uploadedBy: 'u-autre',
  createdAt: new Date(NOW).toISOString(),
  ...partial,
});

const CASES = Object.entries(MESSAGES).flatMap(([m, overrides]) =>
  Object.entries(PIECES).map(([p, piece]) => {
    const attachments = piece === null ? [] : [pieceOf(piece)];
    const subject = message({
      id: '65f0a1b2c3d4e5f6a7b8c9d0',
      conversationId: 'c-1',
      senderId: 'u-autre',
      content: 'le texte',
      originalLanguage: 'fr',
      translations: [],
      createdAt: new Date(NOW - 60_000),
      attachments,
      ...overrides,
    });
    return { label: `${m} × ${p}`, subject, attachments };
  }),
);

const ALL = { save: true, react: true, reply: true, compose: true, share: true };

describe('parité — un seul verdict, partout', () => {
  test('le produit couvre 135 combinaisons', () => {
    expect(CASES.length).toBe(135);
  });

  CASES.forEach(({ label, subject, attachments }) => {
    test(label, () => {
      const exit = contentExitOf(subject, NOW);
      const leaves = exit.leaves;
      const ctx = messageMenuContextOf(subject, { now: NOW });
      const menu = messageMenuItems(ctx).map((item) => item.id);

      const messageLevel = {
        exitOffers: EXIT_ACTIONS.filter((action) => action !== 'forward').every((action) => exitOffers(exit, action) === leaves),
        quoted: quotedExitOf(subject, NOW).leaves,
        sealOpen: !(SEALED_ROW_ATTRIBUTE in sealedProps(subject, NOW)),
        menuCopy: menu.includes('copy'),
        imageable: imageableOf(ctx),
        card: messageCardSubjectOf({ message: subject, servedText: undefined, viewer: VIEWER, readerLanguages: ['fr'], interfaceLanguage: 'fr', now: NOW }) !== null,
        discussion: discussionCardSubjectOf({ messages: [subject], anchorId: subject.id, servedOf: () => undefined, viewer: VIEWER, now: NOW }) !== null,
      };
      const declared = typeof subject.effectFlags === 'number';
      expect(messageLevel).toEqual({ exitOffers: true, quoted: declared && leaves, sealOpen: leaves, menuCopy: leaves, imageable: leaves, card: leaves, discussion: leaves });
      if (leaves) expect(exit.readable).toBe(true);

      const forward = forwardRefusalOf(subject, NOW) === null;
      expect([ctx.canForward, menu.includes('forward')]).toEqual([forward, forward]);
      expect(forward).toBe(exit.forward.allowed);

      attachments.forEach((piece) => {
        const offers = mediaPageOffers({ attachment: piece, message: subject, capabilities: ALL, now: NOW });
        const pieceLeaves = [
          mediaLeaves({ message: subject, piece, now: NOW }),
          offers.save,
          offers.share,
          !attachmentSendRequest({ attachment: piece, message: subject, mine: true, now: NOW }).payload.valueOf().hasOwnProperty('x') &&
            (attachmentSendRequest({ attachment: piece, message: subject, mine: true, now: NOW }).payload as { readonly protected: boolean }).protected === false,
          forwardRequestOf({ conversationId: 'c-1', messages: [subject], now: NOW }).payload.kind === 'messages' &&
            (forwardRequestOf({ conversationId: 'c-1', messages: [subject], now: NOW }).payload as { readonly soleMedia?: { readonly protected: boolean } }).soleMedia?.protected === false,
        ];
        expect(pieceLeaves.filter((says) => says && !leaves)).toEqual([]);
        expect(new Set(pieceLeaves).size).toBe(1);
      });
    });
  });
});

/**
 * LA RÉPONSE QUI CITE (décision porteur du 2026-10-08) — sur les mêmes 135
 * combinaisons, prises cette fois comme CITATION d'une réponse ordinaire :
 * « Imager » (projection, menu, « Plus… », carte) et « Imager la discussion »
 * (sous-menu, carte, et la discussion d'un message ordinaire qui la contient)
 * suivent le verdict de la citation, le sceau aussi ; Copier et Transférer la
 * réponse, eux, restent offerts quelle que soit la citation.
 */
describe('parité — une réponse ordinaire qui cite chaque combinaison', () => {
  const replyTo = (quoted: Message): Message =>
    message({
      id: '65f0a1b2c3d4e5f6a7b8c9d1',
      conversationId: 'c-1',
      senderId: 'u-tiers',
      content: 'la réponse',
      originalLanguage: 'fr',
      translations: [],
      effectFlags: 0,
      createdAt: new Date(NOW - 30_000),
      attachments: [],
      replyTo: quoted,
    });
  const after = message({
    id: '65f0a1b2c3d4e5f6a7b8c9d2',
    conversationId: 'c-1',
    senderId: 'u-tiers',
    content: 'la suite',
    originalLanguage: 'fr',
    translations: [],
    effectFlags: 0,
    createdAt: new Date(NOW - 10_000),
    attachments: [],
  });
  const discussionOf = (messages: readonly Message[], anchorId: string) =>
    discussionCardSubjectOf({ messages, anchorId, servedOf: () => undefined, viewer: VIEWER, now: NOW }) !== null;

  CASES.forEach(({ label, subject }) => {
    test(`cite ${label}`, () => {
      const quotedLeaves = quotedExitOf(subject, NOW).leaves;
      const reply = replyTo(subject);
      const ctx = { ...messageMenuContextOf(reply, { now: NOW }), hasDefaultExportFormat: true };
      const menu = messageMenuItems(ctx).map((item) => item.id);

      expect(citesSealed(reply, NOW)).toBe(!quotedLeaves);
      expect({
        image: messageExitOffers(reply, 'image', NOW),
        imageDiscussion: messageExitOffers(reply, 'imageDiscussion', NOW),
        menuImage: menu.includes('export'),
        menuQuick: menu.includes('exportQuick'),
        plus: imageableOf(ctx),
        submenu: forwardMenuItems(ctx).some((item) => item.id === 'exportDiscussion'),
        card: messageCardSubjectOf({ message: reply, servedText: undefined, viewer: VIEWER, readerLanguages: ['fr'], interfaceLanguage: 'fr', now: NOW }) !== null,
        discussion: discussionOf([subject, reply], reply.id),
        containing: discussionOf([subject, reply, after], after.id),
        sealOpen: !(SEALED_ROW_ATTRIBUTE in sealedProps(reply, NOW)),
      }).toEqual({
        image: quotedLeaves,
        imageDiscussion: quotedLeaves,
        menuImage: quotedLeaves,
        menuQuick: quotedLeaves,
        plus: quotedLeaves,
        submenu: quotedLeaves,
        card: quotedLeaves,
        discussion: quotedLeaves,
        containing: quotedLeaves,
        sealOpen: quotedLeaves,
      });
      expect({ copy: menu.includes('copy'), forward: menu.includes('forward'), others: EXIT_ACTIONS.filter((action) => action !== 'image' && action !== 'imageDiscussion').every((action) => messageExitOffers(reply, action, NOW)) }).toEqual({
        copy: true,
        forward: true,
        others: true,
      });
    });
  });
});
