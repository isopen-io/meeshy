/**
 * LES CADRES DE CAPTURE S'INSTALLENT COMME DES PACKS (#10169, lot LC, PP4) —
 * `/packs/capture-frame`, par le MÊME moteur que les stickers et les cadres de
 * gloire, sur le registre VERSIONNÉ du dépôt
 * (`packages/shared/design/call-capture-frames/packs.json`) : les douze
 * ambiances sont douze packs intégrés, installés par défaut et retirables.
 * Installer ne télécharge rien (#10187) ; aucun tiers ne propose de pack de
 * capture (#10186) : ni `/submissions`, ni `/pending`, ni `/:slug/review`.
 *
 * @jest-environment node
 */
import { describe, it, expect, jest } from '@jest/globals';
import Fastify, { type FastifyInstance, type FastifyRequest } from 'fastify';
import { readFileSync } from 'fs';
import { join } from 'path';
import { FRAME_MOODS, FrameMoodFileSchema, captureFrameCount } from '@meeshy/shared/types/capture-frames';

jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: { child: () => ({ info: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn() }), error: jest.fn() },
}));

import { captureFramePacksRoutes } from '../../../routes/packs-capture-frame';
import { loadPackIndex, packDesignDirCandidates, resolvePackAssetsDir } from '../../../services/packs/PackIndex';
import { memoryPrisma } from './sticker-packs.harness';

const ALICE = '68b0000000000000000000a1';

type Emitted = { readonly room: string; readonly event: string; readonly payload: unknown };

const repositoryIndex = () => loadPackIndex(packDesignDirCandidates(), {}, resolvePackAssetsDir());

async function captureApp() {
  const db = memoryPrisma();
  const emitted: Emitted[] = [];
  const app: FastifyInstance = Fastify({ logger: false });
  app.decorate('prisma', db.prisma as never);
  app.decorate('socketIOHandler', { io: { to: (room: string) => ({ emit: (event: string, payload: unknown) => void emitted.push({ room, event, payload }) }) } } as never);
  app.decorate('authenticate', async (request: FastifyRequest) => {
    (request as unknown as Record<string, unknown>).authContext = { type: 'user', isAuthenticated: true, isAnonymous: false, userId: ALICE, registeredUser: { id: ALICE, role: 'USER' } };
  });
  await app.register(captureFramePacksRoutes, { index: repositoryIndex() });
  await app.ready();
  return { app, db, emitted };
}

type Pack = { readonly slug: string; readonly installed: boolean } & Record<string, unknown>;

const moodFrames = (mood: string): number =>
  captureFrameCount(FrameMoodFileSchema.parse(JSON.parse(readFileSync(join(__dirname, '../../../../../../packages/shared/design/call-capture-frames', `${mood}.json`), 'utf8'))));

describe('/packs/capture-frame — la boutique des ambiances', () => {
  it('sert les douze ambiances dans l’ordre du catalogue, toutes installées d’office, intégrées, sans rien à télécharger', async () => {
    const { app } = await captureApp();
    const shop = await app.inject({ method: 'GET', url: '/' });
    expect(shop.statusCode).toBe(200);
    expect(shop.headers['cache-control']).toBe('private, no-cache');
    const packs = shop.json().data as readonly Pack[];
    expect(packs.map((pack) => pack.slug)).toEqual([...FRAME_MOODS]);
    for (const pack of packs) {
      expect(pack).toMatchObject({ domain: 'capture-frame', origin: 'builtin', builtin: true, installed: true, removable: true, downloadBytes: { story: 0, square: null } });
      expect(pack.itemCount).toBe(moodFrames(pack.slug));
      expect(pack.usage).toEqual({ kind: 'free', surfaces: ['call', 'photo', 'video'] });
    }
    await app.close();
  });

  it('le détail d’un pack sert son contrat adressé par contenu', async () => {
    const { app } = await captureApp();
    const detail = await app.inject({ method: 'GET', url: '/jovial' });
    expect(detail.statusCode).toBe(200);
    expect(detail.json().data).toMatchObject({ slug: 'jovial', contractSchema: 1, contract: { src: expect.stringMatching(/^[0-9a-f]{16}\.json$/) } });
    await app.close();
  });
});

describe('/packs/capture-frame — retirer cache, réinstaller rend', () => {
  it('DELETE retire l’ambiance de « installés », l’écrit sous la clé du domaine et le diffuse', async () => {
    const { app, db, emitted } = await captureApp();
    const removed = await app.inject({ method: 'DELETE', url: '/jovial/install' });
    expect(removed.statusCode).toBe(200);
    expect(removed.json().data).toMatchObject({ slug: 'jovial', installed: false });
    const installed = (await app.inject({ method: 'GET', url: '/installed' })).json().data as readonly Pack[];
    expect(installed.map((pack) => pack.slug)).toEqual(FRAME_MOODS.filter((mood) => mood !== 'jovial'));
    expect(db.choices.map((choice) => [choice.packSlug, choice.installedAt])).toEqual([['capture-frame.jovial', null]]);
    expect(emitted).toEqual([{ room: `user:${ALICE}`, event: 'pack:installation-updated', payload: expect.objectContaining({ domain: 'capture-frame', slug: 'jovial', installed: false }) }]);
    await app.close();
  });

  it('PUT réinstalle l’ambiance retirée', async () => {
    const { app } = await captureApp();
    await app.inject({ method: 'DELETE', url: '/jovial/install' });
    const back = await app.inject({ method: 'PUT', url: '/jovial/install' });
    expect(back.json().data).toMatchObject({ slug: 'jovial', installed: true });
    const installed = (await app.inject({ method: 'GET', url: '/installed' })).json().data as readonly Pack[];
    expect(installed.map((pack) => pack.slug)).toEqual([...FRAME_MOODS]);
    await app.close();
  });
});

describe('/packs/capture-frame — un domaine fermé', () => {
  it('un slug d’un autre domaine (cadre de gloire, sticker) rend 404', async () => {
    const { app, db } = await captureApp();
    expect((await app.inject({ method: 'PUT', url: '/afrique/install' })).statusCode).toBe(404);
    expect((await app.inject({ method: 'PUT', url: '/mee/install' })).statusCode).toBe(404);
    expect(db.choices).toEqual([]);
    await app.close();
  });

  it('aucun tiers ne propose de pack de capture (#10186) : /submissions, /pending et /:slug/review n’existent pas', async () => {
    const { app } = await captureApp();
    expect((await app.inject({ method: 'POST', url: '/submissions', payload: {} })).statusCode).toBe(404);
    expect((await app.inject({ method: 'GET', url: '/submissions' })).statusCode).toBe(404);
    expect((await app.inject({ method: 'GET', url: '/pending' })).statusCode).toBe(404);
    expect((await app.inject({ method: 'POST', url: '/jovial/review', payload: { decision: 'approve' } })).statusCode).toBe(404);
    await app.close();
  });
});
