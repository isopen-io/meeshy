/**
 * #20020 — « qui est VIVANT dans CETTE conversation ? » est posée par sept
 * sites, et cinq n'avaient AUCUNE borne. Ce lot en ramène les deux que l'issue
 * NOMME sur le site unique (`scanLiveParticipants`), et garde ce que la borne
 * partagée oblige à décider.
 *
 * Les témoins ci-dessous ne gardent PAS « la requête porte un `take` » — un
 * `expect(args.take)` atteste un argument, pas une propriété. Ils gardent ce
 * que la borne CHANGE : l'audience est tronquée en le journalisant, et une
 * lecture qui n'a pas nommé toute l'audience n'est jamais remise à la file hors
 * ligne, dont la garantie est DURABLE.
 *
 * @jest-environment node
 */
import { describe, it, expect, jest } from '@jest/globals';
import { emitAttachmentUpdated } from '../emitAttachmentUpdated';
import { enqueueForOfflineParticipants } from '../offlineParticipantQueue';
import { liveParticipantTable } from '../../__tests__/helpers/live-audience-double';
import type { MongoDocument } from '../../__tests__/helpers/mongo-where';

const CONV = '507f1f77bcf86cd799439011';
const MSG = '507f1f77bcf86cd799439022';

const objectId = (serial: number): string => `507f1f77bcf86cd7994${serial.toString(16).padStart(5, '0')}`;

const living = (serial: number): MongoDocument => ({
  id: objectId(serial),
  userId: `u-${String(serial).padStart(6, '0')}`,
  conversationId: CONV,
  isActive: true,
});

const ATTACHMENT = {
  id: 'att-1',
  messageId: MSG,
  fileUrl: 'https://cdn/voice.m4a',
  mimeType: 'audio/m4a',
  fileSize: 100,
  createdAt: new Date(),
  transcription: { text: 'Hi' },
  translations: {},
  reactions: [],
} as Record<string, unknown>;

/**
 * Le double de `participant` EXIGE un `take` (`liveParticipantTable`) : toute
 * lecture non bornée de cette famille lève, et c'est la mutation qui prouve le
 * ROUGE de ce lot.
 *
 * ── Ce qu'il ne borne PAS, et pourquoi c'est écrit ici ──────────────────────
 *
 * `messageReadership` → `translationReaders` ouvre TROIS lectures de plus sur
 * la même table, sous le MÊME `where` (`ADMITTED_FILE_READER_WHERE` **est**
 * `PARTICIPATION_VIVANTE`), toutes sans borne. Elles ne sont pas dans ce lot,
 * et pas par oubli : l'une d'elles (`active`) sert à composer un COMPLÉMENT —
 * `excludedQueueKeys`, les lecteurs qui ne doivent RIEN recevoir. Une lecture
 * tronquée y SOUS-exclut, donc y fuit : borner cette lecture-là sans la rendre
 * fail-closed serait pire que de la laisser nue. C'est un lot à part, avec son
 * audit (#20020 en ouvre le suivi).
 *
 * Elles sont donc routées vers une table PERMISSIVE, reconnues à leur
 * projection — `joinedAt` / `historyVisibleFrom` / `shareLinkId`, qu'aucune
 * lecture d'AUDIENCE ne demande. Le compte de lectures asserté plus bas ne
 * mesure ainsi que ce que ce lot gouverne.
 */
const READERSHIP_SELECT_MARKERS = ['joinedAt', 'historyVisibleFrom', 'shareLinkId'];

const isReadershipRead = (args: { readonly select?: Record<string, unknown> }): boolean =>
  READERSHIP_SELECT_MARKERS.some((key) => args.select != null && key in args.select);

function harness(rows: readonly MongoDocument[], options?: { readonly onAudienceRead?: (read: number) => void }) {
  const bounded = liveParticipantTable(rows, { onRead: options?.onAudienceRead });
  const enqueued: { key: string }[] = [];
  const emitted: string[][] = [];

  const audience = {
    findMany: async (args: Parameters<typeof bounded.findMany>[0] = {}) =>
      // Aucun suspect ⇒ `translationReaders` rend `{ kind: 'room' }` sans
      // ouvrir ses deux lectures suivantes : le plancher d'historique n'est pas
      // le sujet de ce lot.
      isReadershipRead(args) ? [] : bounded.findMany(args),
    reads: bounded.reads,
    lastArgs: bounded.lastArgs,
  };

  const makeOperator = (rooms: string[]) => ({
    to: (room: string) => makeOperator([...rooms, room]),
    except: () => makeOperator(rooms),
    emit: () => {
      emitted.push(rooms);
    },
  });

  return {
    audience,
    enqueued,
    emitted,
    deps: {
      io: { to: (room: string) => makeOperator([room]) } as never,
      prisma: {
        participant: audience,
        conversationShareLink: { findMany: async () => [] },
        message: {
          findUnique: async () => ({
            createdAt: new Date('2020-01-01T00:00:00.000Z'),
            encryptionMode: null,
            conversation: { encryptionMode: null },
          }),
        },
      } as never,
      deliveryQueue: {
        enqueue: async (key: string) => {
          enqueued.push({ key });
        },
      } as never,
      connectedUsers: new Map() as never,
    },
  };
}

describe('#20020 — la borne est partagée, et la file ne reçoit que ce qui est PROUVÉ', () => {
  it("l'enrichissement d'une pièce lit son audience UNE fois et la remet à la file", async () => {
    const h = harness([living(0), living(1), { id: objectId(2), userId: null, conversationId: CONV, isActive: true }]);

    await emitAttachmentUpdated({ ...h.deps, conversationId: CONV, messageId: MSG, attachment: ATTACHMENT });

    // UNE lecture : celle de l'audience. La file n'en ouvre pas une seconde,
    // parce que la liste lui est remise — et c'est ce que `complete` autorise.
    expect(h.audience.reads()).toBe(1);
    expect(h.enqueued.map((e) => e.key).sort()).toEqual(['u-000000', 'u-000001', objectId(2)].sort());
  });

  it("une audience TRONQUÉE n'est jamais remise à la file : elle la relit elle-même", async () => {
    // Deux lignes, un plafond d'une : la troncature est atteinte sans fabriquer
    // 50 001 lignes (`cap` existe pour cela), et le second appel de la file
    // retrouve le même plafond.
    const h = harness([living(0), living(1)]);

    await emitAttachmentUpdated({
      ...h.deps,
      conversationId: CONV,
      messageId: MSG,
      attachment: ATTACHMENT,
      audienceScanCap: 1,
    });

    // DEUX lectures, et c'est le point : une liste tronquée n'est pas
    // l'audience, donc elle n'a pas le droit de décider pour une garantie
    // DURABLE. Avant ce lot, la remise était gardée par `length > 0` — vrai
    // d'une liste tronquée.
    expect(h.audience.reads()).toBe(2);
  });

  it('une lecture TOMBÉE ne dit pas « personne » : la file relit, et peut réussir', async () => {
    let first = true;
    const h = harness([living(0)], {
      onAudienceRead: () => {
        if (first) {
          first = false;
          throw new Error('mongo down');
        }
      },
    });

    await emitAttachmentUpdated({ ...h.deps, conversationId: CONV, messageId: MSG, attachment: ATTACHMENT });

    // La seconde lecture a réussi : l'absent reçoit son entrée. Remettre `[]` à
    // la file l'aurait privé de la pièce ENRICHIE pour toujours — règle du
    // cycle 116.
    expect(h.enqueued.map((e) => e.key)).toEqual(['u-000000']);
  });

  it("une audience COMPLÈTE et VIDE est une affirmation : la file n'enfile pour personne, sans relire", async () => {
    const h = harness([{ id: objectId(9), userId: 'u-gone', conversationId: CONV, isActive: false }]);

    await emitAttachmentUpdated({ ...h.deps, conversationId: CONV, messageId: MSG, attachment: ATTACHMENT });

    expect(h.audience.reads()).toBe(1);
    expect(h.enqueued).toEqual([]);
  });
});

describe('#20020 — la file hors ligne lit ses participants sous la MÊME borne', () => {
  const queueDeps = (table: { findMany: unknown }) => ({
    deliveryQueue: { enqueue: async () => {} } as never,
    prisma: { participant: table, message: { findUnique: async () => ({ content: 'x', deletedAt: null }) } } as never,
    connectedUsers: new Map() as never,
  });

  it('la lecture nominale est bornée — un double qui exige `take` ne lève plus', async () => {
    const table = liveParticipantTable([living(0)]);

    await expect(
      enqueueForOfflineParticipants(queueDeps(table), {
        conversationId: CONV,
        eventType: 'reaction-added',
        messageId: MSG,
        payload: {},
        atRest: false,
      }),
    ).resolves.toBeUndefined();

    expect(table.reads()).toBe(1);
  });

  it('la lecture du Prisme (restriction par langue) est bornée elle aussi', async () => {
    const table = liveParticipantTable([
      { ...living(0), language: 'fr', user: null },
    ]);

    await expect(
      enqueueForOfflineParticipants(queueDeps(table), {
        conversationId: CONV,
        eventType: 'translation',
        messageId: MSG,
        payload: {},
        atRest: false,
        restrictToReadersOfLanguage: 'fr',
      }),
    ).resolves.toBeUndefined();

    expect(table.reads()).toBe(1);
  });
});
