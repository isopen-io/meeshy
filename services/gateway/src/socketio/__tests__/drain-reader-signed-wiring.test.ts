/**
 * #16655 — LE CROCHET EST MONTÉ, pas seulement écrit.
 *
 * `drainReaderSignedPayload.test.ts` prouve la RÈGLE sur le module pur. Il ne
 * prouve pas que le drain l'APPELLE — et le dépôt a déjà payé cette distinction
 * deux fois (`ExplodeOverlay` et `WaooOverlay` ont vécu déclarés, testés et
 * jamais branchés ; leur transform jouait, leurs particules jamais). « Un effet
 * déclaré doit être MONTÉ » : ce fichier est la garde de montage.
 *
 * Il construit un VRAI `MeeshySocketIOManager` et fait traverser le drain à une
 * entrée scellée, pour un lecteur hors ligne. L'assertion porte sur la charge
 * qui atteint `io.to(user:<id>).emit(...)` — pas sur un retour de fonction.
 *
 * ## Pourquoi un fichier à lui
 *
 * `MeeshySocketIOManager.test.ts` est GELÉ à 8158 lignes
 * (`gateway-test-file-size-budget.test.ts`), et il y est exactement. Il ne peut
 * pas héberger ce témoin, et la règle du dépôt est d'extraire avant d'ajouter.
 *
 * ## Le discriminant du témoin
 *
 * Le jeton signé PORTE l'identité du lecteur : `checkReaderFileToken` la rend.
 * Un témoin qui n'asserterait que « l'URL a changé de forme » passerait au vert
 * sur une signature faite pour n'importe qui — or servir au lecteur A une
 * adresse signée pour B est un 404 de plus, pas un correctif.
 *
 * @jest-environment node
 */
import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { MESSAGE_EFFECT_FLAGS } from '@meeshy/shared/types/message-effect-flags';

import { getIoState } from './helpers/message-new-parity-mocks';

import { MeeshySocketIOManager } from '../MeeshySocketIOManager';
import { makePrisma, makeTranslationService } from './helpers/message-new-parity-fixtures';
import { SERVER_EVENTS } from '@meeshy/shared/types/socketio-events';
import { checkReaderFileToken, readSigningKeys } from '../../services/attachments/readerFileSignature';

const CONV = '747200000000000000000000';
const MSG = 'msg-sealed-1';
const PIECE = 'aaaaaaaaaaaaaaaaaaaaaaa1';
const KEY = '2026/10/68f2a81417a557e8ce4ddfc1/voice_8b1f0c1e.m4a';
const TRACK = `/api/v1/attachments/file/translated/${PIECE}_en.mp3`;
const READER = 'user-offline-1';
const READER_PARTICIPANT = 'cccccccccccccccccccccc01';

const readerOf = (url: unknown): string | null => {
  if (typeof url !== 'string') return null;
  const match = /^\/api\/v1\/attachments\/signed\/([^/]+)\/([^/]+)$/.exec(url);
  if (!match) return null;
  const check = checkReaderFileToken({
    token: match[1] as string,
    storageKey: decodeURIComponent(match[2] as string),
    keys: readSigningKeys(),
    now: new Date(),
  });
  return check.kind === 'valid' ? check.readerParticipantId : null;
};

describe('#16655 — le drain signe les adresses pour le lecteur qu’il sert', () => {
  let manager: any;
  let prisma: any;
  let ioState: ReturnType<typeof getIoState>;

  const sealedEntry = () => ({
    eventType: 'attachment-updated',
    conversationId: CONV,
    messageId: MSG,
    payload: {
      conversationId: CONV,
      messageId: MSG,
      attachment: {
        id: PIECE,
        messageId: MSG,
        fileUrl: KEY,
        mimeType: 'audio/mp4',
        translations: { en: { url: TRACK } },
        isViewOnce: false,
        isBlurred: false,
        effectFlags: 0,
      },
    },
  });

  beforeEach(async () => {
    process.env.ATTACHMENT_URL_SIGNING_KEY = Buffer.alloc(32, 1).toString('base64');
    jest.clearAllMocks();
    ioState = getIoState();
    ioState.to.mockClear();
    ioState.toEmit.mockClear();

    prisma = makePrisma();
    // Le lecteur est membre vivant, et la pièce appartient à un message ÉPHÉMÈRE
    // — donc liée au lecteur, donc à signer.
    prisma.participant.findMany.mockImplementation(async (args: any) =>
      args?.select?.bannedAt
        ? [{ conversationId: CONV, bannedAt: null, id: READER_PARTICIPANT, shareLinkId: null }]
        : []
    );
    prisma.message.findMany = jest.fn(async () => [
      {
        id: MSG,
        isViewOnce: false,
        isBlurred: false,
        effectFlags: MESSAGE_EFFECT_FLAGS.EPHEMERAL,
        ephemeralDuration: 30,
        expiresAt: new Date(Date.now() + 3_600_000),
      },
    ]) as any;
    prisma.conversationShareLink = { findMany: jest.fn(async () => []) };

    manager = new MeeshySocketIOManager({} as any, prisma as any, makeTranslationService() as any);
    await manager.initialize();
  });

  afterEach(() => {
    delete process.env.ATTACHMENT_URL_SIGNING_KEY;
  });

  /** La charge `message:attachment-updated` réellement émise sur la room du lecteur. */
  const replayed = (): Record<string, any> | undefined => {
    const call = (ioState.toEmit.mock.calls as any[]).find(
      (c) => c[0] === SERVER_EVENTS.MESSAGE_ATTACHMENT_UPDATED
    );
    return call?.[1] as Record<string, any> | undefined;
  };

  it('rejoue une pièce scellée avec des adresses SIGNÉES pour ce lecteur, jamais nues', async () => {
    manager.setDeliveryQueue({ drain: jest.fn(async () => [sealedEntry()]) } as any);

    await manager._drainPendingMessages(READER, false);

    const payload = replayed();
    expect(payload).toBeDefined();
    // Les deux adresses, et le jeton de CHACUNE résolu vers CE lecteur.
    expect(readerOf(payload?.attachment?.fileUrl)).toBe(READER_PARTICIPANT);
    expect(readerOf(payload?.attachment?.translations?.en?.url)).toBe(READER_PARTICIPANT);
    // Et l'adresse nue ne part plus — c'est elle qui tuait le média en cache.
    expect(payload?.attachment?.fileUrl).not.toBe(KEY);
  });

  it('ne fait QU’UNE lecture de protection pour tout le lot', async () => {
    const many = Array.from({ length: 20 }, () => sealedEntry());
    manager.setDeliveryQueue({ drain: jest.fn(async () => many) } as any);

    await manager._drainPendingMessages(READER, false);

    expect(prisma.message.findMany.mock.calls).toHaveLength(1);
  });

  /**
   * LE SEUL TÉMOIN QUI DISTINGUE « SIGNE JUSTE » DE « SIGNE TOUT ».
   *
   * Une pièce ORDINAIRE ne doit rien payer : son adresse reste celle que les
   * caches clients connaissent, et une URL qui change chaque heure leur
   * coûterait un re-téléchargement — `signedAttachmentUrls.ts` l'écrit comme
   * une décision, pas comme une tolérance.
   *
   * Sans ce témoin, les deux précédents passeraient aussi bien sur une
   * implémentation qui signe tout, aveuglément.
   *
   * La nuance qui se lit ici : la clé de ce média est de forme SIGNABLE (donc
   * `carriesSignableAddress` la retient au premier étage, et c'est voulu — le
   * filtre se trompe du côté permissif), mais elle n'est pas SCELLÉE au repos.
   * Rien ne la lie donc à un lecteur, et `attachmentIsReaderBound` la laisse
   * passer intacte. Deux formes de clé, deux questions distinctes.
   */
  it('laisse l’adresse d’une pièce ORDINAIRE telle quelle', async () => {
    prisma.message.findMany = jest.fn(async () => [
      { id: MSG, isViewOnce: false, isBlurred: false, effectFlags: 0, ephemeralDuration: null, expiresAt: null },
    ]) as any;
    manager.setDeliveryQueue({ drain: jest.fn(async () => [sealedEntry()]) } as any);

    await manager._drainPendingMessages(READER, false);

    expect(replayed()?.attachment?.fileUrl).toBe(KEY);
    expect(replayed()?.attachment?.translations?.en?.url).toBe(TRACK);
  });
});
