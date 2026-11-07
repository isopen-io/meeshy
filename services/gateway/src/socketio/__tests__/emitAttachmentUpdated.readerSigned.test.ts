/**
 * #9646 — `message:attachment-updated` d'une pièce protégée (le vocal d'une
 * flamme dont la transcription et les pistes TTS arrivent après l'envoi) part
 * par destinataire, avec les adresses de la pièce signées pour chacun.
 *
 * @jest-environment node
 */
import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { MESSAGE_EFFECT_FLAGS } from '@meeshy/shared/types/message-effect-flags';
import { SERVER_EVENTS } from '@meeshy/shared/types/socketio-events';

import { emitAttachmentUpdated } from '../emitAttachmentUpdated';
import { checkReaderFileToken, readSigningKeys } from '../../services/attachments/readerFileSignature';

const KEY = '2026/10/68f2a81417a557e8ce4ddfc1/voice_8b1f0c1e.m4a';
const PIECE = 'aaaaaaaaaaaaaaaaaaaaaaa1';
const TRACK = `/api/v1/attachments/file/translated/${PIECE}_en.mp3`;
const A = { id: 'cccccccccccccccccccccc01', userId: 'bbbbbbbbbbbbbbbbbbbbbb01', isActive: true };
const B = { id: 'cccccccccccccccccccccc02', userId: null, isActive: true };

const attachment = {
  id: PIECE,
  messageId: 'msg-1',
  fileUrl: KEY,
  mimeType: 'audio/mp4',
  fileSize: 100,
  createdAt: new Date(),
  transcription: { text: 'Hi' },
  translations: { en: { url: TRACK } },
  isViewOnce: false,
  isBlurred: false,
  effectFlags: 0,
} as Record<string, unknown>;

type EnqueueCall = [string, { payload: { attachment: { fileUrl: string; translations: { en: { url: string } } } } }];

function deps(message: Record<string, unknown> | null) {
  const emitted: Array<{ rooms: string[]; event: string; payload: { attachment: { fileUrl: string; translations: { en: { url: string } } } } }> = [];
  const operator = (rooms: string[]) => ({
    to: (room: string) => operator([...rooms, room]),
    emit: (event: string, payload: never) => emitted.push({ rooms, event, payload }),
  });
  return {
    emitted,
    deps: {
      io: { to: (room: string) => operator([room]) } as never,
      prisma: {
        participant: { findMany: jest.fn(async () => [A, B]) },
        message: { findUnique: jest.fn(async () => message) },
        conversationShareLink: { findMany: jest.fn(async () => []) },
      } as never,
      deliveryQueue: { enqueue: jest.fn(async () => undefined) } as never,
      connectedUsers: new Map() as never,
    },
  };
}

const readerOf = (url: string) => {
  const match = /^\/api\/v1\/attachments\/signed\/([^/]+)\/([^/]+)$/.exec(url);
  if (!match) return null;
  const check = checkReaderFileToken({ token: match[1] as string, storageKey: decodeURIComponent(match[2] as string), keys: readSigningKeys(), now: new Date() });
  return check.kind === 'valid' ? check.readerParticipantId : null;
};

beforeEach(() => {
  process.env.ATTACHMENT_URL_SIGNING_KEY = Buffer.alloc(32, 1).toString('base64');
});
afterEach(() => {
  delete process.env.ATTACHMENT_URL_SIGNING_KEY;
});

const FLAME = { isViewOnce: false, isBlurred: false, effectFlags: MESSAGE_EFFECT_FLAGS.EPHEMERAL, ephemeralDuration: 30, expiresAt: new Date(Date.now() + 3600_000) };

describe('emitAttachmentUpdated — pièce protégée', () => {
  it('une émission par participant admis, sur sa room personnelle, chaque piste signée pour lui', async () => {
    const { emitted, deps: d } = deps(FLAME);
    await emitAttachmentUpdated({ ...d, conversationId: 'conv-1', messageId: 'msg-1', attachment });
    expect(emitted.map((e) => e.rooms)).toEqual([[`user:${A.userId}`], [`user:${B.id}`]]);
    expect(emitted.every((e) => e.event === SERVER_EVENTS.MESSAGE_ATTACHMENT_UPDATED)).toBe(true);
    expect(emitted.map((e) => readerOf(e.payload.attachment.translations.en.url))).toEqual([A.id, B.id]);
    expect(emitted.map((e) => readerOf(e.payload.attachment.fileUrl))).toEqual([A.id, B.id]);
  });

  it('signe aussi quand la ligne du message est introuvable — l’absence ne prouve pas l’ordinaire', async () => {
    const { emitted, deps: d } = deps(null);
    await emitAttachmentUpdated({ ...d, conversationId: 'conv-1', messageId: 'msg-1', attachment });
    expect(emitted.map((e) => readerOf(e.payload.attachment.fileUrl))).toEqual([A.id, B.id]);
  });

  /**
   * LA FILE PORTE L'ADRESSE NUE — C'EST LE CONTRAT, PAS LE DÉFAUT (#16655).
   *
   * Ce fichier EXERÇAIT le défaut de #16655 à chaque exécution sans jamais le
   * regarder : `connectedUsers: new Map()` met les DEUX participants hors
   * ligne dans ses trois cas, donc l'enfilage tourne toujours — et toutes ses
   * assertions portaient sur `emitted`.
   *
   * Ces deux témoins ferment l'autre moitié, et ils restent VERTS après le
   * correctif de #16655 : c'est leur rôle. Une adresse signée vit 6–7 h quand
   * une entrée de file vit 48 h — signer à l'ENFILAGE échangerait un 404
   * contre un autre. La file garde donc l'adresse nue, et c'est le DRAIN qui
   * signe, pour le lecteur, au moment où il émet.
   *
   * Ils INTERDISENT le correctif naïf. Quiconque signera ici les fera tomber.
   */
  it('enfile l’adresse NUE pour chaque absent — la signature appartient au drain', async () => {
    const { deps: d } = deps(FLAME);
    await emitAttachmentUpdated({ ...d, conversationId: 'conv-1', messageId: 'msg-1', attachment });

    const calls = (d.deliveryQueue as unknown as { enqueue: { mock: { calls: EnqueueCall[] } } }).enqueue.mock.calls;
    const byKey = new Map(calls.map(([key, entry]) => [key, entry.payload]));

    // A est inscrit (clé de file = `userId`) ; B est un invité de lien (clé = `Participant.id`).
    expect(byKey.get(A.userId)?.attachment.fileUrl).toBe(KEY);
    expect(byKey.get(B.id)?.attachment.fileUrl).toBe(KEY);
  });

  it('enfile aussi la piste traduite NUE — même raison, même contrat', async () => {
    const { deps: d } = deps(FLAME);
    await emitAttachmentUpdated({ ...d, conversationId: 'conv-1', messageId: 'msg-1', attachment });

    const calls = (d.deliveryQueue as unknown as { enqueue: { mock: { calls: EnqueueCall[] } } }).enqueue.mock.calls;
    const byKey = new Map(calls.map(([key, entry]) => [key, entry.payload]));

    expect(byKey.get(A.userId)?.attachment.translations.en.url).toBe(TRACK);
    expect(byKey.get(B.id)?.attachment.translations.en.url).toBe(TRACK);
  });

  it('garde la diffusion chaînée, adresses intactes, pour une pièce ordinaire', async () => {
    const { emitted, deps: d } = deps({ isViewOnce: false, isBlurred: false, effectFlags: 0, ephemeralDuration: null, expiresAt: null });
    await emitAttachmentUpdated({ ...d, conversationId: 'conv-1', messageId: 'msg-1', attachment });
    expect(emitted).toHaveLength(1);
    expect(emitted[0]?.rooms[0]).toBe('conversation:conv-1');
    expect(emitted[0]?.payload.attachment.translations.en.url).toBe(TRACK);
  });
});
