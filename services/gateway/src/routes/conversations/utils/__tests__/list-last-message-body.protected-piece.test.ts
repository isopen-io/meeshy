import { describe, it, expect } from '@jest/globals';
import { MESSAGE_EFFECT_FLAGS } from '@meeshy/shared/types/message-effect-flags';
import { projectListLastMessageBody, type ListLastMessageRow } from '../list-last-message-body';

const DETAIL_KEYS = [
  'thumbnailUrl',
  'originalName',
  'fileSize',
  'duration',
  'width',
  'height',
  'pageCount',
  'alt',
  'metadata',
  'bitrate',
  'sampleRate',
] as const;

const photo = (id: string, overrides: Record<string, unknown> = {}) => ({
  id,
  mimeType: 'image/jpeg',
  thumbnailUrl: `https://cdn/${id}-thumb.jpg`,
  originalName: `${id}.jpg`,
  fileSize: 1000,
  duration: 12_000,
  width: 450,
  height: 456,
  pageCount: 3,
  alt: 'Le code est 4521',
  metadata: { exif: { gps: '48.85,2.35' } },
  bitrate: 128_000,
  sampleRate: 44_100,
  isViewOnce: false,
  isBlurred: false,
  effectFlags: 0,
  ...overrides,
});

const makeRow = (attachments: readonly ReturnType<typeof photo>[], overrides: Record<string, unknown> = {}) =>
  ({
    id: 'msg-1',
    content: 'Regarde',
    messageType: 'image',
    isViewOnce: false,
    metadata: null,
    translations: null,
    originalLanguage: 'fr',
    attachments,
    _count: { attachments: attachments.length },
    ...overrides,
  }) as unknown as ListLastMessageRow;

const context = (overrides: Record<string, unknown> = {}) => ({
  protection: null,
  servedExpiresAt: undefined,
  viewOnceConsumed: false,
  ...overrides,
});

const servedFirst = (result: ReturnType<typeof projectListLastMessageBody>): Record<string, unknown> => {
  const first = result.attachments?.[0];
  if (!first) throw new Error('aucune pièce servie');
  return first as unknown as Record<string, unknown>;
};

const expectNoDetail = (served: Record<string, unknown>) =>
  DETAIL_KEYS.forEach((key) => expect(served[key] ?? null).toBeNull());

describe('projectListLastMessageBody — une pièce masquée ou d’éphémère ne sert aucun détail', () => {
  it('pièce floutée d’un message ordinaire : nature et drapeaux gardés, tout détail à null', () => {
    const result = projectListLastMessageBody(makeRow([photo('a1', { isBlurred: true })]), context());
    const served = servedFirst(result);
    expect(served.id).toBe('a1');
    expect(served.mimeType).toBe('image/jpeg');
    expect(served.isBlurred).toBe(true);
    expectNoDetail(served);
    expect(result.content).toBe('Regarde');
  });

  it.each([
    ['VIEW_ONCE', MESSAGE_EFFECT_FLAGS.VIEW_ONCE],
    ['BLURRED', MESSAGE_EFFECT_FLAGS.BLURRED],
  ])('pièce masquée par le seul bitfield effectFlags (%s) : aucun détail', (_label, effectFlags) => {
    const served = servedFirst(projectListLastMessageBody(makeRow([photo('a1', { effectFlags })]), context()));
    expect(served.effectFlags).toBe(effectFlags);
    expectNoDetail(served);
  });

  it('pièce à vue unique propre (isViewOnce) : aucun détail', () => {
    const served = servedFirst(projectListLastMessageBody(makeRow([photo('a1', { isViewOnce: true })]), context()));
    expect(served.isViewOnce).toBe(true);
    expectNoDetail(served);
  });

  it('message éphémère actif : même une pièce ordinaire ne sert aucun détail, le texte reste servi', () => {
    const result = projectListLastMessageBody(
      makeRow([photo('a1'), photo('a2', { fileSize: 2000 })]),
      context({ protection: 'ephemeral' }),
    );
    expectNoDetail(servedFirst(result));
    expect(result.content).toBe('Regarde');
    expect(result.attachmentSummary).toEqual({ count: 2, kinds: { image: 2 }, totalSize: null });
  });

  it('une seconde pièce masquée : la première garde ses détails, le poids total est retenu', () => {
    const result = projectListLastMessageBody(makeRow([photo('a1'), photo('a2', { isBlurred: true })]), context());
    expect(servedFirst(result).fileSize).toBe(1000);
    expect(result.attachmentSummary).toEqual({ count: 2, kinds: { image: 2 }, totalSize: null });
  });

  it('une clé inconnue d’une pièce masquée passe à null (liste d’autorisation, fail-closed)', () => {
    const served = servedFirst(
      projectListLastMessageBody(
        makeRow([photo('a1', { isBlurred: true, fps: 30, fileUrl: 'https://cdn/secret.jpg' })]),
        context(),
      ),
    );
    expect(served.fps).toBeNull();
    expect(served.fileUrl).toBeNull();
  });

  it('non-régression : un message ordinaire garde tous ses détails et la somme des poids', () => {
    const result = projectListLastMessageBody(
      makeRow([photo('a1'), photo('a2', { fileSize: 2000 })]),
      context(),
    );
    const served = servedFirst(result);
    expect(served.fileSize).toBe(1000);
    expect(served.thumbnailUrl).toBe('https://cdn/a1-thumb.jpg');
    expect(served.originalName).toBe('a1.jpg');
    expect(served.duration).toBe(12_000);
    expect(served.width).toBe(450);
    expect(served.pageCount).toBe(3);
    expect(served.alt).toBe('Le code est 4521');
    expect(served.bitrate).toBe(128_000);
    expect(result.attachmentSummary).toEqual({ count: 2, kinds: { image: 2 }, totalSize: 3000 });
  });

  it('rétrocompatible : la pièce masquée garde exactement les clés de la pièce ordinaire', () => {
    const ordinary = servedFirst(projectListLastMessageBody(makeRow([photo('a1')]), context()));
    const masked = servedFirst(projectListLastMessageBody(makeRow([photo('a1', { isBlurred: true })]), context()));
    expect(Object.keys(masked).sort()).toEqual(Object.keys(ordinary).sort());
  });

  it('un message retenu (vue unique) reste inchangé : ni pièce ni résumé', () => {
    const result = projectListLastMessageBody(makeRow([photo('a1')]), context({ protection: 'view-once' }));
    expect(result.attachments).toBeNull();
    expect(result.attachmentSummary).toBeNull();
    expect(result.content).toBe('');
  });
});
