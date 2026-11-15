/**
 * emitConversationPreviewUpdate.historyFloor.test.ts
 *
 * L'aperçu POUSSÉ obéit au plancher d'historique de chaque destinataire, comme
 * `GET /conversations` (`resolveVisibleLastMessages`) — sans quoi une édition,
 * une suppression ou une traduction repousserait dans la ligne de liste d'un
 * membre ajouté après coup, ou d'un anonyme entré par un lien sans historique,
 * un message d'AVANT son arrivée que le REST lui masque.
 *
 * Le plancher vient de `services/historyFloor`, lu sur les lignes participant
 * que l'émetteur charge déjà. Posture d'échec : le plancher est un contrôle
 * d'accès — une sonde en échec ne dégrade pas en « on sert » pour un lecteur
 * borné, et un plancher illisible retire de l'émission le destinataire qu'il
 * concerne. PAR DESTINATAIRE, jamais en bloc : la lecture des liens n'apprend
 * rien sur un lecteur dont le plancher se rend sans elle.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import { SERVER_EVENTS } from '@meeshy/shared/types/socketio-events';
import { emitConversationPreviewUpdate } from '../../../socketio/emitConversationPreviewUpdate';

const CONV_ID = 'aaaaaaaaaaaaaaaaaaaaaaaa';
const ACTOR_ID = '507f1f77bcf86cd799439011';
const LATE_USER_ID = '507f1f77bcf86cd799439012';
const LATEST_ID = 'bbbbbbbbbbbbbbbbbbbbbbbb';
const SINCE_ID = 'cccccccccccccccccccccccc';

const LATEST_AT = new Date('2026-06-01T10:00:00Z');
const JOINED_AFTER_LATEST = new Date('2026-06-15T00:00:00Z');
const JOINED_BEFORE_LATEST = new Date('2026-05-01T00:00:00Z');

type Emission = { room: string; event: string; payload: Record<string, unknown> };

const makeIo = (emissions: Emission[]) => ({
  to: (room: string) => ({
    emit: (event: string, payload: unknown) => {
      emissions.push({ room, event, payload: payload as Record<string, unknown> });
    },
  }),
});

const prefs = { systemLanguage: 'fr', regionalLanguage: null, customDestinationLanguage: null, deviceLocale: null };

const actorRow = () => ({ id: 'part-actor', userId: ACTOR_ID, user: prefs, role: 'member', joinedAt: JOINED_BEFORE_LATEST, shareLinkId: null });

const latestMessage = () => ({
  id: LATEST_ID,
  content: 'avant ton arrivée',
  senderId: 'part-actor',
  originalLanguage: 'fr',
  translations: null,
  createdAt: LATEST_AT,
});

const makePrisma = (opts: {
  participants: unknown[];
  replacement?: unknown;
  links?: Array<{ id: string; allowViewHistory: boolean }>;
  probeFails?: boolean;
  floorFails?: boolean;
}) =>
  ({
    participant: { findMany: jest.fn(async () => opts.participants) },
    message: {
      findFirst: jest.fn(async (q: any) => {
        const isReplacement = q?.where?.id !== undefined || q?.where?.createdAt !== undefined;
        return isReplacement ? (opts.replacement ?? null) : latestMessage();
      }),
    },
    userMessageDeletion: {
      findMany: jest.fn(async () => {
        if (opts.probeFails) throw new Error('mongo down');
        return [];
      }),
    },
    userConversationPreferences: { findMany: jest.fn(async () => []) },
    conversationShareLink: {
      findMany: jest.fn(async () => {
        if (opts.floorFails) throw new Error('mongo down');
        return opts.links ?? [];
      }),
    },
  }) as never;

const previews = (emissions: Emission[]) => emissions.filter((e) => e.event === SERVER_EVENTS.CONVERSATION_UPDATED);
const previewFor = (emissions: Emission[], userId: string) => previews(emissions).find((e) => e.room === `user:${userId}`);

describe('emitConversationPreviewUpdate — plancher d’historique du destinataire', () => {
  it('vide la ligne d’un membre arrivé APRÈS le dernier message, et sert le global aux autres', async () => {
    const emissions: Emission[] = [];
    const prisma = makePrisma({
      participants: [
        actorRow(),
        { id: 'part-late', userId: LATE_USER_ID, user: prefs, role: 'member', joinedAt: JOINED_AFTER_LATEST, shareLinkId: null, permissions: { canViewHistory: false } },
      ],
      replacement: null,
    });

    await emitConversationPreviewUpdate(prisma, makeIo(emissions), CONV_ID, ACTOR_ID);

    expect(previewFor(emissions, ACTOR_ID)?.payload.lastMessageId).toBe(LATEST_ID);
    const late = previewFor(emissions, LATE_USER_ID);
    expect(late).toBeDefined();
    expect(late?.payload.lastMessageId).toBeNull();
  });

  it('sert au membre borné le premier message DEPUIS son arrivée', async () => {
    const emissions: Emission[] = [];
    const prisma = makePrisma({
      participants: [
        { id: 'part-late', userId: LATE_USER_ID, user: prefs, role: 'member', joinedAt: JOINED_AFTER_LATEST, shareLinkId: null, permissions: { canViewHistory: false } },
      ],
      replacement: { ...latestMessage(), id: SINCE_ID, createdAt: new Date('2026-07-01T00:00:00Z') },
    });

    await emitConversationPreviewUpdate(prisma, makeIo(emissions), CONV_ID, ACTOR_ID);

    expect(previewFor(emissions, LATE_USER_ID)?.payload.lastMessageId).toBe(SINCE_ID);
    expect((prisma as any).message.findFirst.mock.calls[1][0].where).toMatchObject({
      conversationId: CONV_ID,
      deletedAt: null,
      createdAt: { gte: JOINED_AFTER_LATEST },
    });
  });

  it('borne un participant SANS compte entré par un lien qui ferme l’historique — le lien est lu', async () => {
    const emissions: Emission[] = [];
    const prisma = makePrisma({
      participants: [
        { id: 'part-anon', userId: null, user: null, role: 'member', joinedAt: JOINED_AFTER_LATEST, shareLinkId: 'sl-1', permissions: {} },
      ],
      links: [{ id: 'sl-1', allowViewHistory: false }],
      replacement: null,
    });

    await emitConversationPreviewUpdate(prisma, makeIo(emissions), CONV_ID, ACTOR_ID);

    expect((prisma as any).conversationShareLink.findMany.mock.calls[0][0].where).toEqual({ id: { in: ['sl-1'] } });
    const anon = previewFor(emissions, 'part-anon');
    expect(anon).toBeDefined();
    expect(anon?.payload.lastMessageId).toBeNull();
    // Aucun compte à sonder : les tables de masquage ne sont pas lues.
    expect((prisma as any).userMessageDeletion.findMany).not.toHaveBeenCalled();
  });

  it('ne borne pas un membre arrivé AVANT le dernier message, ni un administrateur arrivé après', async () => {
    const emissions: Emission[] = [];
    const prisma = makePrisma({
      participants: [
        { id: 'part-early', userId: ACTOR_ID, user: prefs, role: 'member', joinedAt: JOINED_BEFORE_LATEST, shareLinkId: null, permissions: { canViewHistory: false } },
        { id: 'part-admin', userId: LATE_USER_ID, user: prefs, role: 'admin', joinedAt: JOINED_AFTER_LATEST, shareLinkId: null, permissions: { canViewHistory: false } },
      ],
    });

    await emitConversationPreviewUpdate(prisma, makeIo(emissions), CONV_ID, ACTOR_ID);

    expect(previewFor(emissions, ACTOR_ID)?.payload.lastMessageId).toBe(LATEST_ID);
    expect(previewFor(emissions, LATE_USER_ID)?.payload.lastMessageId).toBe(LATEST_ID);
    expect((prisma as any).message.findFirst).toHaveBeenCalledTimes(1);
  });

  it('n’émet RIEN à un lecteur borné quand la sonde échoue — les autres sont servis', async () => {
    const emissions: Emission[] = [];
    const prisma = makePrisma({
      participants: [
        actorRow(),
        { id: 'part-late', userId: LATE_USER_ID, user: prefs, role: 'member', joinedAt: JOINED_AFTER_LATEST, shareLinkId: null, permissions: { canViewHistory: false } },
      ],
      probeFails: true,
    });

    await emitConversationPreviewUpdate(prisma, makeIo(emissions), CONV_ID, ACTOR_ID);

    expect(previewFor(emissions, ACTOR_ID)?.payload.lastMessageId).toBe(LATEST_ID);
    expect(previewFor(emissions, LATE_USER_ID)).toBeUndefined();
  });

  /**
   * Fail-closed reste la règle — mais il se mesure PAR DESTINATAIRE.
   *
   * La lecture des liens n'apprend rien sur un lecteur dont le plancher se rend
   * SANS elle (admin, octroi par date, droit figé, aucune participation par
   * lien) : abandonner l'émission entière le privait d'un aperçu que la panne
   * ne rendait pourtant pas incertain. Seul celui dont le LIEN décidait sort de
   * l'émission, exactement comme `loadHistoryFloorsOrFail` ne retire que les
   * conversations à verdict `link-decides`.
   */
  it('n’émet RIEN au lecteur dont le LIEN décidait quand la lecture échoue — et sert les autres', async () => {
    const emissions: Emission[] = [];
    const onError = jest.fn();
    const prisma = makePrisma({
      participants: [
        actorRow(),
        { id: 'part-anon', userId: null, user: null, role: 'member', joinedAt: JOINED_AFTER_LATEST, shareLinkId: 'sl-1', permissions: {} },
      ],
      floorFails: true,
    });

    await emitConversationPreviewUpdate(prisma, makeIo(emissions), CONV_ID, ACTOR_ID, onError);

    expect(previewFor(emissions, ACTOR_ID)?.payload.lastMessageId).toBe(LATEST_ID);
    expect(previewFor(emissions, 'part-anon')).toBeUndefined();
    expect(previews(emissions)).toHaveLength(1);
    expect(onError).not.toHaveBeenCalled();
  });

  it('borne quand même le lecteur RÉGLÉ hors lien pendant la panne — le plancher n’est pas perdu', async () => {
    const emissions: Emission[] = [];
    const prisma = makePrisma({
      participants: [
        { id: 'part-late', userId: LATE_USER_ID, user: prefs, role: 'member', joinedAt: JOINED_AFTER_LATEST, shareLinkId: null, permissions: { canViewHistory: false } },
        { id: 'part-anon', userId: null, user: null, role: 'member', joinedAt: JOINED_AFTER_LATEST, shareLinkId: 'sl-1', permissions: {} },
      ],
      replacement: null,
      floorFails: true,
    });

    await emitConversationPreviewUpdate(prisma, makeIo(emissions), CONV_ID, ACTOR_ID);

    // Servi, mais SOUS son plancher : le dernier message global lui reste caché.
    expect(previewFor(emissions, LATE_USER_ID)?.payload.lastMessageId).toBeNull();
    expect(previewFor(emissions, 'part-anon')).toBeUndefined();
  });

  it('n’émet plus rien du tout quand TOUS les planchers sont illisibles', async () => {
    const emissions: Emission[] = [];
    const prisma = makePrisma({
      participants: [
        { id: 'part-anon', userId: null, user: null, role: 'member', joinedAt: JOINED_AFTER_LATEST, shareLinkId: 'sl-1', permissions: {} },
      ],
      floorFails: true,
    });

    await emitConversationPreviewUpdate(prisma, makeIo(emissions), CONV_ID, ACTOR_ID);

    expect(previews(emissions)).toHaveLength(0);
  });
});
