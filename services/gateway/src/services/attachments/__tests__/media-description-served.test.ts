/**
 * #12333 — la description d'une pièce de conversation est SERVIE dans le fil
 * (REST et socket : la même forme, `serializeAttachmentForSocket` et la liste
 * des messages lisant `attachmentSocketSelect`), et masquée sous protection —
 * de la PIÈCE comme du MESSAGE qui la porte. Témoins sur la VALEUR SERVIE.
 *
 * @jest-environment node
 */
import { describe, it, expect } from '@jest/globals';
import { servedDescription } from '../mediaSideContent';
import { attachmentSocketSelect } from '../attachmentIncludes';
import { serializeAttachmentForSocket, type SocketAttachmentRow } from '../../../socketio/serializeAttachmentForSocket';

const DESCRIBED = {
  alt: 'Un chat roux dort sur le canapé',
  altLanguage: 'fr',
  altTranslations: { en: { text: 'A red cat sleeps on the sofa' } },
  isViewOnce: false,
  isBlurred: false,
  effectFlags: 0,
  isEncrypted: false,
  encryptionMode: null,
};
const LIVE_MESSAGE = { isViewOnce: false, isBlurred: false, effectFlags: 0, expiresAt: null, deletedAt: null, isEncrypted: false, encryptionMode: null };
const MASKED = { alt: null, altLanguage: null, altTranslations: null };

describe('servedDescription — la loi', () => {
  it('pièce et message ordinaires : la description, sa langue et ses traductions', () => {
    expect(servedDescription({ ...DESCRIBED, message: LIVE_MESSAGE })).toEqual({
      alt: DESCRIBED.alt, altLanguage: 'fr', altTranslations: DESCRIBED.altTranslations,
    });
  });

  it('pièce pas encore rattachée : servie à son seul lecteur possible, son auteur', () => {
    expect(servedDescription({ ...DESCRIBED, message: null }).alt).toBe(DESCRIBED.alt);
  });

  it.each([
    ['pièce floutée', { ...DESCRIBED, isBlurred: true, message: LIVE_MESSAGE }],
    ['pièce à vue unique', { ...DESCRIBED, isViewOnce: true, message: LIVE_MESSAGE }],
    ['pièce chiffrée', { ...DESCRIBED, isEncrypted: true, message: LIVE_MESSAGE }],
    ['message à vue unique', { ...DESCRIBED, message: { ...LIVE_MESSAGE, isViewOnce: true } }],
    ['message flouté', { ...DESCRIBED, message: { ...LIVE_MESSAGE, isBlurred: true } }],
    ['message éphémère', { ...DESCRIBED, message: { ...LIVE_MESSAGE, expiresAt: new Date('2099-01-01') } }],
    ['message chiffré', { ...DESCRIBED, message: { ...LIVE_MESSAGE, encryptionMode: 'e2ee' } }],
  ])('%s : tout à null', (_label, row) => {
    expect(servedDescription(row)).toEqual(MASKED);
  });
});

describe('le fil charge et sert la description (REST et socket partagent `attachmentSocketSelect`)', () => {
  it('le select charge la description ET la protection du message porteur', () => {
    expect(attachmentSocketSelect).toEqual(expect.objectContaining({ alt: true, altLanguage: true, altTranslations: true }));
    expect((attachmentSocketSelect as { message?: { select?: Record<string, true> } }).message?.select).toEqual(
      expect.objectContaining({ isViewOnce: true, isBlurred: true, effectFlags: true, expiresAt: true, isEncrypted: true, encryptionMode: true }),
    );
  });

  const row = (over: Record<string, unknown>) => ({
    id: 'a1', messageId: 'm1', mimeType: 'image/jpeg', fileUrl: 'f.jpg', createdAt: new Date(0), ...DESCRIBED, message: LIVE_MESSAGE, ...over,
  }) as unknown as SocketAttachmentRow;

  it('le canal socket sert la description d’une pièce ordinaire, sans la ligne du message', () => {
    const served = serializeAttachmentForSocket(row({})) as unknown as Record<string, unknown>;
    expect(served.alt).toBe(DESCRIBED.alt);
    expect(served.altLanguage).toBe('fr');
    expect(served.altTranslations).toEqual(DESCRIBED.altTranslations);
    expect(served).not.toHaveProperty('message');
  });

  it('le canal socket la retient sous protection du MESSAGE', () => {
    const served = serializeAttachmentForSocket(row({ message: { ...LIVE_MESSAGE, isViewOnce: true } })) as unknown as Record<string, unknown>;
    expect(served.alt).toBeNull();
    expect(served.altTranslations).toBeNull();
  });
});
