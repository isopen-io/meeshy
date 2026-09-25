/**
 * La version DISPONIBLE de la coque de `apps/web` (#6937) — la seule source
 * qu'une coque Capacitor lit pour annoncer une mise à jour : elle embarque ses
 * actifs et n'a pas de service worker, donc rien d'autre ne lui apprend qu'une
 * version neuve est publiée.
 *
 *   - `SHELL_LATEST_VERSION` vide (défaut) ⇒ `latestVersion: ''` : aucune
 *     annonce ne se fabrique ;
 *   - la fiche du magasin suit la plateforme DEMANDÉE (`getAppStoreUrl`), la
 *     même résolution que le `storeUrl` du 426.
 *
 * @jest-environment node
 */

import { describe, it, expect, beforeEach, afterAll } from '@jest/globals';
import Fastify from 'fastify';

import { appRoutes } from '../../../routes/app';

const buildApp = async () => {
  const app = Fastify();
  await app.register(appRoutes);
  await app.ready();
  return app;
};

describe('GET /app/shell-version', () => {
  const saved = {
    latest: process.env.SHELL_LATEST_VERSION,
    appStore: process.env.APP_STORE_URL,
    playStore: process.env.PLAY_STORE_URL,
  };

  beforeEach(() => {
    delete process.env.SHELL_LATEST_VERSION;
    delete process.env.APP_STORE_URL;
    delete process.env.PLAY_STORE_URL;
  });

  afterAll(() => {
    const restore = (key: string, value: string | undefined) => {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    };
    restore('SHELL_LATEST_VERSION', saved.latest);
    restore('APP_STORE_URL', saved.appStore);
    restore('PLAY_STORE_URL', saved.playStore);
  });

  it('rend une version VIDE tant que rien n’est publié', async () => {
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/app/shell-version?platform=android' });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.latestVersion).toBe('');
    await app.close();
  });

  it('rend la version publiée et la fiche Play Store pour Android', async () => {
    process.env.SHELL_LATEST_VERSION = '2.0.7';
    process.env.PLAY_STORE_URL = 'https://play.google.com/store/apps/details?id=me.meeshy.app';
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/app/shell-version?platform=android' });
    expect(res.json().data).toEqual({
      latestVersion: '2.0.7',
      storeUrl: 'https://play.google.com/store/apps/details?id=me.meeshy.app',
    });
    await app.close();
  });

  it('rend la fiche App Store pour iOS', async () => {
    process.env.SHELL_LATEST_VERSION = '2.0.7';
    process.env.APP_STORE_URL = 'https://apps.apple.com/app/meeshy/id1';
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/app/shell-version?platform=ios' });
    expect(res.json().data.storeUrl).toBe('https://apps.apple.com/app/meeshy/id1');
    await app.close();
  });
});
