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

function deps(message: Record<string, unknown> | null, options: { audienceFails?: boolean } = {}) {
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
        participant: {
          findMany: jest.fn(async (args: any) => {
            // La loi d'AUDIENCE et le PLAN partagent cette requête — c'est ce
            // que ce fichier a appris en mutant la garde : le `select` ne les
            // distingue pas, et « faire tomber le plan » fait tomber
            // l'audience D'ABORD.
            if (options.audienceFails && args?.select?.shareLinkId) throw new Error('admitted-reader select unavailable');
            return [A, B];
          }),
        },
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
   * #18619 — ce que la FILE reçoit, et c'est l'autre moitié de ce fichier.
   *
   * Le direct signe par destinataire depuis #9646 ; l'enfilement, lui, déposait
   * la charge GÉNÉRIQUE — l'adresse NUE d'une pièce liée au lecteur, écrite
   * dans Redis pour 48 h et rejouée telle quelle.
   */
  it('enfile la pièce SIGNÉE pour chaque destinataire, pas l’adresse nue', async () => {
    const { deps: d } = deps(FLAME);
    const enqueue = d.deliveryQueue.enqueue as jest.Mock;

    await emitAttachmentUpdated({ ...d, conversationId: 'conv-1', messageId: 'msg-1', attachment });

    // Les deux participants sont HORS LIGNE (`connectedUsers` est vide) : les
    // deux entrées existent, et chacune porte l'adresse signée de SA ligne.
    const deposes = (enqueue.mock.calls as any[]).map((c) => [c[0], readerOf(c[1].payload.attachment.fileUrl)]);
    expect(deposes).toEqual([[A.userId, A.id], [B.id, B.id]]);
  });

  /**
   * Ce que ce site fait QUAND IL NE SAIT PAS adresser — et la réponse n'est pas
   * celle que l'issue supposait.
   *
   * #18619 demandait que `PLAN_UNAVAILABLE` gouverne les deux canaux ici aussi.
   * Mesuré, ce verdict est **inatteignable sur ce site** : une lecture de
   * PROTECTION tombée est récupérée fail-closed À L'INTÉRIEUR du plan (#16965,
   * `{}` ⇒ la pièce est tenue pour protégée et signée), et la seule lecture qui
   * pourrait le produire — celle des lecteurs ADMIS — est la MÊME requête que
   * celle de la loi d'audience, dont le verdict `'unknown'` fait sortir
   * l'émetteur avant toute émission comme avant tout enfilage.
   *
   * Ce témoin mesure donc ce qui EST vrai. La garde de plan reste posée au
   * site, avec sa raison écrite — elle tiendrait si la garde d'audience
   * changeait de forme — mais **rien ici ne prétend la prouver**, et c'est la
   * mutation qui a imposé cette honnêteté : la retirer ne faisait rougir aucun
   * témoin.
   */
  it('ne diffuse ni n’enfile quand la loi d’audience ne conclut pas', async () => {
    const { emitted, deps: d } = deps(FLAME, { audienceFails: true });
    const enqueue = d.deliveryQueue.enqueue as jest.Mock;

    await emitAttachmentUpdated({ ...d, conversationId: 'conv-1', messageId: 'msg-1', attachment });

    expect(emitted).toEqual([]);
    expect(enqueue).not.toHaveBeenCalled();
  });

  /**
   * L'autre moitié, sans laquelle le lot serait un correctif trop large : une
   * pièce ORDINAIRE n'a pas de plan, et doit continuer d'être enfilée telle
   * quelle. Retenir sur `null` couperait le rattrapage de tout l'enrichissement.
   */
  it('enfile TEL QUEL une pièce ordinaire — le plan vaut `null`, pas « inconnu »', async () => {
    const { deps: d } = deps({ isViewOnce: false, isBlurred: false, effectFlags: 0, ephemeralDuration: null, expiresAt: null });
    const enqueue = d.deliveryQueue.enqueue as jest.Mock;

    await emitAttachmentUpdated({ ...d, conversationId: 'conv-1', messageId: 'msg-1', attachment });

    expect(enqueue).toHaveBeenCalled();
    expect((enqueue.mock.calls as any[])[0][1].payload.attachment.fileUrl).toBe(KEY);
  });

  it('garde la diffusion chaînée, adresses intactes, pour une pièce ordinaire', async () => {
    const { emitted, deps: d } = deps({ isViewOnce: false, isBlurred: false, effectFlags: 0, ephemeralDuration: null, expiresAt: null });
    await emitAttachmentUpdated({ ...d, conversationId: 'conv-1', messageId: 'msg-1', attachment });
    expect(emitted).toHaveLength(1);
    expect(emitted[0]?.rooms[0]).toBe('conversation:conv-1');
    expect(emitted[0]?.payload.attachment.translations.en.url).toBe(TRACK);
  });
});
