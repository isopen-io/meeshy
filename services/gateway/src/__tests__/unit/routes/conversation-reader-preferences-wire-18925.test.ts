/**
 * #18925 — LA LIGNE DE CONVERSATION SERT LES PRÉFÉRENCES DU LECTEUR QUE LE TEMPS
 * RÉEL DIFFUSE : `version`, `mentionsOnly`, `orderInCategory`, `clearHistoryBefore`.
 *
 * `user:preferences-updated` porte ces quatre champs (`ConversationPreferencesPayload`
 * + `version`), la route riche de la liste ne les servait pas : le `select` ne les
 * lisait pas (sauf `clearHistoryBefore`, lu côté serveur puis retiré) et le schéma
 * de fil ne les déclarait pas. Mesuré sur les trois clients :
 *
 * - le web ne pouvait pas arbitrer une diffusion contre la relecture REST, faute
 *   de `version` sur la ligne ;
 * - iOS posait `version == 0`, `mentionsOnly == false`, `orderInCategory == nil`
 *   sur un store vierge : « mentions seulement » s'affichait désactivé et l'ordre
 *   manuel d'une catégorie se perdait ;
 * - Android écrivait l'ordre reçu par `user:preferences-reordered`, et le balayage
 *   riche suivant le remettait à zéro.
 *
 * Les deux moitiés de la chaîne sont gardées : la REQUÊTE (un mock Prisma rend ce
 * qu'on lui dit, quel que soit le `select` — le témoin assert donc sur le `select`
 * lui-même) et la SÉRIALISATION (`fast-json-stringify` retire en silence toute clé
 * non déclarée — le témoin sérialise et regarde ce qui sort). Additif : une ligne
 * d'un ancien serveur, sans ces clés, sort sans elles — rien n'est fabriqué.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import Fastify, { type FastifyRequest } from 'fastify';
import build from 'fast-json-stringify';
import { conversationListResponseSchema } from '@meeshy/shared/types/api-schemas';

import conversationPreferencesRoutes from '../../../routes/conversation-preferences';
import {
  conversationListQuerySelect,
  conversationUserPreferencesSelect,
} from '../../../routes/conversations/core-selects';
import { conversationDetailWithEngagementResponseSchema } from '../../../routes/conversations/engagement';
import { servedListRowRestriction } from '../../../routes/conversations/viewerWriteRestriction';

const CONV_ID = '507f1f77bcf86cd7994390bb';
const VIEWER_ID = '68bf0000000000000000000a';
const CLEARED_AT = '2026-11-01T08:30:00.000Z';

const READER_FIELDS = ['version', 'mentionsOnly', 'orderInCategory', 'clearHistoryBefore'] as const;

const storedPreferences = () => ({
  isPinned: true,
  isMuted: false,
  isArchived: false,
  tags: ['travail'],
  categoryId: '68bf00000000000000000c01',
  customName: null,
  reaction: null,
  appearance: null,
  version: 7,
  mentionsOnly: true,
  orderInCategory: 3,
  clearHistoryBefore: CLEARED_AT,
});

const listRow = (userPreferences: readonly Record<string, unknown>[]) => ({
  id: CONV_ID,
  type: 'group',
  title: 'Équipe',
  isActive: true,
  memberCount: 4,
  createdAt: '2026-02-25T22:21:26.871Z',
  userPreferences,
});

const serializeListRow = (row: Record<string, unknown>) =>
  JSON.parse(build(conversationListResponseSchema as never)({ success: true, data: [row] })).data[0];

const serializeDetail = (conversation: Record<string, unknown>) =>
  JSON.parse(build(conversationDetailWithEngagementResponseSchema as never)({ success: true, data: conversation })).data;

describe('#18925 — la requête LIT les préférences du lecteur que le fil va servir', () => {
  it.each(READER_FIELDS)('le select des préférences charge `%s`', (field) => {
    expect(conversationUserPreferencesSelect).toHaveProperty(field, true);
  });

  it('la route de liste passe ce select à sa jointure, filtrée sur le lecteur', () => {
    const select = conversationListQuerySelect(VIEWER_ID);
    expect(select.userPreferences.where).toEqual({ userId: VIEWER_ID });
    for (const field of READER_FIELDS) expect(select.userPreferences.select).toHaveProperty(field, true);
  });
});

describe('#18925 — la ligne de liste SERT ce qu’elle a lu', () => {
  it('les quatre champs du lecteur survivent à la sérialisation, avec leurs valeurs', () => {
    const [served] = serializeListRow(listRow([storedPreferences()])).userPreferences;

    expect(served).toMatchObject({ version: 7, mentionsOnly: true, orderInCategory: 3, clearHistoryBefore: CLEARED_AT });
  });

  it('un ordre et un effacement absents sortent `null`, pas effacés du fil', () => {
    const [served] = serializeListRow(
      listRow([{ ...storedPreferences(), orderInCategory: null, clearHistoryBefore: null }]),
    ).userPreferences;

    expect(served.orderInCategory).toBeNull();
    expect(served.clearHistoryBefore).toBeNull();
  });

  it('une ligne d’ancien serveur, sans ces clés, sort sans elles — rien n’est fabriqué', () => {
    const { version: _v, mentionsOnly: _m, orderInCategory: _o, clearHistoryBefore: _c, ...legacy } = storedPreferences();
    const [served] = serializeListRow(listRow([legacy])).userPreferences;

    for (const field of READER_FIELDS) expect(served).not.toHaveProperty(field);
    expect(served.isPinned).toBe(true);
  });

  it('la fiche de détail (`?fields=userPreferences`) sert les mêmes champs que la ligne', () => {
    const [served] = serializeDetail({ id: CONV_ID, type: 'group', userPreferences: [storedPreferences()] }).userPreferences;

    expect(served).toMatchObject({ version: 7, mentionsOnly: true, orderInCategory: 3, clearHistoryBefore: CLEARED_AT });
  });
});

describe('#18925 — `GET /user-preferences/conversations` sert l’effacement d’historique du lecteur', () => {
  const storedRow = () => ({
    id: '68bf00000000000000000p01',
    userId: VIEWER_ID,
    conversationId: CONV_ID,
    ...storedPreferences(),
    clearHistoryBefore: new Date(CLEARED_AT),
    readingMode: 'auto',
    category: null,
    createdAt: new Date('2026-10-01T00:00:00.000Z'),
    updatedAt: new Date('2026-11-01T08:30:00.000Z'),
  });

  const buildApp = async () => {
    const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
    app.decorate('prisma', {
      userConversationPreferences: {
        findUnique: jest.fn(async () => storedRow()),
        findMany: jest.fn(async () => [storedRow()]),
        count: jest.fn(async () => 1),
      },
    } as never);
    app.decorate('authenticate', async (req: FastifyRequest) => {
      (req as unknown as { authContext: unknown }).authContext = {
        isAuthenticated: true,
        isAnonymous: false,
        userId: VIEWER_ID,
        registeredUser: { id: VIEWER_ID },
      };
    });
    await app.register(conversationPreferencesRoutes);
    await app.ready();
    return app;
  };

  it('la liste paginée le sert, avec la version qui l’accompagne', async () => {
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/user-preferences/conversations' });

    expect(res.statusCode).toBe(200);
    expect(res.json().data[0]).toMatchObject({ clearHistoryBefore: CLEARED_AT, version: 7 });
    await app.close();
  });

  it('la lecture d’une conversation le sert aussi', async () => {
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: `/user-preferences/conversations/${CONV_ID}` });

    expect(res.json().data.clearHistoryBefore).toBe(CLEARED_AT);
    await app.close();
  });
});

describe('#18925 — la ligne SYNTHÉTISÉE d’un mineur dans Global porte les mêmes colonnes', () => {
  it('à leurs valeurs par défaut : version 0, mentions seulement coupé, ni ordre ni effacement', () => {
    const served = servedListRowRestriction({
      conversationType: 'global',
      birthDate: new Date('2011-06-01T00:00:00.000Z'),
      now: new Date('2026-11-17T00:00:00.000Z'),
      userPreferences: [],
    });

    expect(served.userPreferences).toEqual([
      expect.objectContaining({ isArchived: true, version: 0, mentionsOnly: false, orderInCategory: null, clearHistoryBefore: null }),
    ]);
  });
});
