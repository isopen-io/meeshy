/**
 * #20305 — le transport REST de `message:edited` est le seul des QUATRE à ne pas
 * signer sa charge ENFILÉE, ni à se taire sur `PLAN_UNAVAILABLE`.
 *
 * `broadcastMessageMutation` calcule le plan de signature par lecteur et ne s'en
 * sert que pour l'émission EN DIRECT. L'enfilage, cent lignes plus bas et dans un
 * `try` SÉPARÉ, ne référence jamais `plan` : il passe la charge GÉNÉRIQUE, donc
 * le `fileUrl` NU d'une pièce liée au lecteur, écrit dans Redis pour 48 h
 * (`DELIVERY_QUEUE_TTL_SECONDS`). Ses trois frères — `MessageHandler`
 * (socket), `callSummaryEditedDelivery`, `message:new` — composent tous
 * `offlineSignedEdit` + `queueSigningFields`.
 *
 * PIÈGE ARMÉ, pas panne, et c'est ce que ce fichier exerce : les trois routes
 * REST d'édition ne mettent aujourd'hui AUCUNE pièce jointe dans leur charge,
 * donc `readerSignedPlanForMessageId` rend `null` (il sort sur
 * `asAttachments(...).length === 0`) et rien ne fuit. Le jour où quelqu'un
 * ajoute `attachments` pour la parité avec le chemin socket — une ligne — le
 * défaut s'arme : l'émission directe signe pour le lecteur, l'entrée enfilée
 * stocke l'adresse nue, et le rejeu remet une adresse que
 * `ATTACHMENT_URL_SIGNATURE_ENFORCE` refuse. Règle du cycle 84 : on ne laisse
 * pas un piège armé au motif que personne n'a encore marché dessus.
 *
 * @jest-environment node
 */
import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';

import { broadcastMessageMutation } from '../broadcastMessageMutation';
import { checkReaderFileToken, readSigningKeys } from '../../services/attachments/readerFileSignature';
import { matchesMongoWhere, type MongoDocument } from '../../__tests__/helpers/mongo-where';

const KEY = '2026/10/68f2a81417a557e8ce4ddfc1/photo_8b1f0c1e.jpg';
const A = { id: 'cccccccccccccccccccccc01', userId: 'bbbbbbbbbbbbbbbbbbbbbb01' };
const B = { id: 'cccccccccccccccccccccc02', userId: 'bbbbbbbbbbbbbbbbbbbbbb02' };
const piece = { id: 'aaaaaaaaaaaaaaaaaaaaaaa1', fileUrl: KEY, isViewOnce: false, isBlurred: false, effectFlags: 0 };

const ECRIT = new Date('2026-10-08T10:00:00Z');
const AVANT = new Date('2026-10-01T00:00:00Z');

/** Un message PROTÉGÉ : c'est lui qui met la remise sur le chemin du plan signé. */
const PROTECTED_ROW = { isViewOnce: true, isBlurred: false, effectFlags: 0, ephemeralDuration: null, expiresAt: null };

type QueueCall = {
  readonly resolvePayloadForReader?: (queueKey: string, participantId: string) => Record<string, unknown>;
  readonly payload?: { readonly attachments?: ReadonlyArray<{ readonly fileUrl?: string }> };
};

/** La requête du PLAN signé se reconnaît à sa projection : `readerSignedTargets`
 * est le seul lecteur de `Participant` à ne demander que ces trois colonnes.
 * C'est le discriminant qui permet de faire tomber la lecture du PLAN SANS
 * faire tomber celle de l'AUDIENCE — sans quoi le témoin passerait par la
 * branche `'unknown'` de `messageReadership` et n'attesterait pas ce qu'il dit
 * (le piège que `planReadFailure.test.ts` documente sur son dernier témoin). */
const isPlanTargetsQuery = (select: Record<string, unknown> | undefined): boolean =>
  select !== undefined &&
  Object.keys(select).sort().join(',') === 'id,shareLinkId,userId';

function setup(options: { readonly planReadThrows?: boolean } = {}) {
  const target = (room: string) => ({ emit: () => undefined, except: () => target(room) });
  const enqueueOfflineMessageMutation = jest.fn(async () => undefined);
  const rows: MongoDocument[] = [
    { ...A, conversationId: 'conv-1', isActive: true, role: 'member', joinedAt: AVANT, shareLinkId: null, historyVisibleFrom: null, permissions: null, anonymousSession: null, user: { role: 'USER' } },
    { ...B, conversationId: 'conv-1', isActive: true, role: 'member', joinedAt: AVANT, shareLinkId: null, historyVisibleFrom: null, permissions: null, anonymousSession: null, user: { role: 'USER' } },
  ];
  const prisma = {
    participant: {
      findMany: jest.fn(async (args: { readonly where?: Record<string, unknown>; readonly select?: Record<string, unknown> }) => {
        if (options.planReadThrows === true && isPlanTargetsQuery(args?.select)) throw new Error('mongo down (destinataires du plan)');
        return rows.filter((row) => matchesMongoWhere(row, args?.where ?? {}));
      }),
    },
    message: {
      findUnique: jest.fn(async () => ({ ...PROTECTED_ROW, createdAt: ECRIT })),
      findFirst: jest.fn(async () => null),
    },
    conversationShareLink: {
      findMany: jest.fn(async () => []),
    },
  };
  const manager = {
    getIO: () => ({ to: target }),
    enqueueOfflineMessageMutation,
    emitUnreadCountsToRecipients: jest.fn(async () => undefined),
  };
  return { prisma, manager, enqueueOfflineMessageMutation };
}

const readerOf = (url: string | undefined) => {
  const match = /^\/api\/v1\/attachments\/signed\/([^/]+)\/([^/]+)$/.exec(url ?? '');
  if (!match) return null;
  const check = checkReaderFileToken({ token: match[1] as string, storageKey: decodeURIComponent(match[2] as string), keys: readSigningKeys(), now: new Date() });
  return check.kind === 'valid' ? check.readerParticipantId : null;
};

beforeEach(() => {
  process.env.ATTACHMENT_URL_SIGNING_KEY = Buffer.alloc(32, 9).toString('base64');
});
afterEach(() => {
  delete process.env.ATTACHMENT_URL_SIGNING_KEY;
});

const run = (prisma: unknown, manager: unknown, payload: Record<string, unknown>, errors: unknown[] = []) =>
  broadcastMessageMutation({
    prisma: prisma as never,
    manager: manager as never,
    conversationId: 'conv-1',
    actorUserId: A.userId,
    messageId: 'msg-1',
    eventType: 'edited',
    payload: payload as never,
    onError: (error: unknown) => errors.push(error),
  });

const queued = (mock: { readonly mock: { readonly calls: ReadonlyArray<ReadonlyArray<unknown>> } }): QueueCall | undefined =>
  mock.mock.calls[0]?.[0] as QueueCall | undefined;

describe('#20305 — la charge ENFILÉE du transport REST de message:edited', () => {
  it('porte les adresses signées de SON destinataire, pas le `fileUrl` nu', async () => {
    const { prisma, manager, enqueueOfflineMessageMutation } = setup();

    await run(prisma, manager, { id: 'msg-1', content: 'corrigé', attachments: [piece] });

    const call = queued(enqueueOfflineMessageMutation);
    expect(call?.resolvePayloadForReader).toBeInstanceOf(Function);
    const forA = call?.resolvePayloadForReader?.(A.userId, A.id) as { attachments?: Array<{ fileUrl?: string }> };
    const forB = call?.resolvePayloadForReader?.(B.userId, B.id) as { attachments?: Array<{ fileUrl?: string }> };
    expect(readerOf(forA?.attachments?.[0]?.fileUrl)).toBe(A.id);
    expect(readerOf(forB?.attachments?.[0]?.fileUrl)).toBe(B.id);
    expect(JSON.stringify([forA, forB])).not.toContain(KEY);
  });

  it('compose le SCELLEMENT de citation AVANT la signature — un seul crochet par lecteur', async () => {
    const { prisma, manager, enqueueOfflineMessageMutation } = setup();

    await broadcastMessageMutation({
      prisma: prisma as never,
      manager: manager as never,
      conversationId: 'conv-1',
      actorUserId: A.userId,
      messageId: 'msg-1',
      eventType: 'edited',
      sealedQuoteAudience: new Map([[B.userId, new Date()]]),
      payload: { id: 'msg-1', content: 'corrigé', attachments: [piece], replyTo: { id: 'q', content: 'secret' } } as never,
    });

    const call = queued(enqueueOfflineMessageMutation);
    const forB = call?.resolvePayloadForReader?.(B.userId, B.id);
    // Le lecteur masqué n'emporte ni la citation ni l'adresse de la pièce…
    expect(JSON.stringify(forB)).not.toContain('secret');
    expect(JSON.stringify(forB)).not.toContain(KEY);
    // …et le lecteur admis garde la sienne, signée pour lui.
    const forA = call?.resolvePayloadForReader?.(A.userId, A.id) as { attachments?: Array<{ fileUrl?: string }> };
    expect(readerOf(forA?.attachments?.[0]?.fileUrl)).toBe(A.id);
  });

  it('n’enfile RIEN quand le plan est indisponible — une adresse peut-être protégée ne s’écrit pas 48 h dans Redis', async () => {
    const { prisma, manager, enqueueOfflineMessageMutation } = setup({ planReadThrows: true });

    await run(prisma, manager, { id: 'msg-1', content: 'corrigé', attachments: [piece] });

    expect(enqueueOfflineMessageMutation.mock.calls).toEqual([]);
  });

  it('sans aucune pièce — le cas des trois routes REST d’aujourd’hui — enfile la charge générique, inchangée', async () => {
    const { prisma, manager, enqueueOfflineMessageMutation } = setup();

    await run(prisma, manager, { id: 'msg-1', content: 'corrigé' });

    const call = queued(enqueueOfflineMessageMutation);
    expect(enqueueOfflineMessageMutation.mock.calls.length).toBe(1);
    expect(call?.resolvePayloadForReader).toBeUndefined();
  });
});
