/**
 * #10188 — l'ANCIEN chemin des fichiers de packs de stickers de tiers
 * (`GET /attachments/file/sticker-packs/…`) reste servi aux clients publiés
 * (#9223), et chaque usage laisse UNE ligne de journal sans identité : c'est la
 * mesure que son retrait citera. Ni la clé de stockage, ni l'adresse, ni l'IP —
 * la route montée, une plateforme et une version normalisées comme celles du
 * compteur d'accès (#4275).
 *
 * La VRAIE route de fichiers est montée sur un VRAI volume temporaire.
 *
 * @jest-environment node
 */
import { describe, it, expect, jest } from '@jest/globals';
import Fastify from 'fastify';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

const mockInfo = jest.fn<(event: string, facts?: Record<string, unknown>) => void>();

jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: { child: () => ({ error: jest.fn(), warn: jest.fn(), info: (event: string, facts?: Record<string, unknown>) => mockInfo(event, facts), debug: jest.fn() }) },
}));

import { registerFileStreamRoute } from '../../../routes/attachments/download';
import { STICKER_PACK_LEGACY_FILE_EVENT } from '../../../services/packs/stickerPackLegacyPath';

const noOwner = {
  messageAttachment: { findMany: async () => [], findUnique: async () => null },
  message: { findMany: async () => [] },
};

async function buildApp(root: string) {
  const app = Fastify({ logger: false });
  registerFileStreamRoute(app, noOwner as never, { uploadRoot: root, mirror: null });
  await app.ready();
  return app;
}

function volume() {
  const root = mkdtempSync(join(tmpdir(), 'meeshy-legacy-'));
  mkdirSync(join(root, 'sticker-packs/f1'), { recursive: true });
  mkdirSync(join(root, '2026/10'), { recursive: true });
  writeFileSync(join(root, 'sticker-packs/f1/bonjour.png'), 'S-bonjour');
  writeFileSync(join(root, '2026/10/photo_8b1f0c1e.jpg'), 'jpeg');
  return root;
}

const legacyLines = () => mockInfo.mock.calls.filter(([event]) => event === STICKER_PACK_LEGACY_FILE_EVENT);

describe('GET /attachments/file/sticker-packs/… — l’ancien chemin, servi et mesuré', () => {
  it('sert toujours le fichier, et compte l’usage par une ligne sans identité', async () => {
    mockInfo.mockClear();
    const root = volume();
    const app = await buildApp(root);
    try {
      const res = await app.inject({
        method: 'GET',
        url: '/attachments/file/sticker-packs/f1/bonjour.png',
        headers: { 'x-meeshy-platform': 'ios', 'x-meeshy-version': '1.4.2', 'user-agent': 'Meeshy/1.4.2 CFNetwork' },
      });
      expect(res.statusCode).toBe(200);
      expect(res.body).toBe('S-bonjour');
      expect(legacyLines()).toEqual([[STICKER_PACK_LEGACY_FILE_EVENT, { route: '/attachments/file/*', platform: 'ios', version: '1.4.2' }]]);
      expect(JSON.stringify(legacyLines())).not.toContain('bonjour');
      expect(JSON.stringify(legacyLines())).not.toContain('f1');
    } finally {
      await app.close();
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('ne compte pas un autre fichier, ni un fichier de pack absent du volume', async () => {
    mockInfo.mockClear();
    const root = volume();
    const app = await buildApp(root);
    try {
      expect((await app.inject({ method: 'GET', url: '/attachments/file/2026/10/photo_8b1f0c1e.jpg' })).statusCode).toBe(200);
      expect((await app.inject({ method: 'GET', url: '/attachments/file/sticker-packs/f1/absent.png' })).statusCode).toBe(404);
      expect(legacyLines()).toEqual([]);
    } finally {
      await app.close();
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('un client sans en-tête se compte quand même, sous « absent »', async () => {
    mockInfo.mockClear();
    const root = volume();
    const app = await buildApp(root);
    try {
      await app.inject({ method: 'GET', url: '/attachments/file/sticker-packs%2Ff1%2Fbonjour.png', headers: { 'user-agent': '' } });
      expect(legacyLines()).toEqual([[STICKER_PACK_LEGACY_FILE_EVENT, { route: '/attachments/file/*', platform: 'absent', version: 'absent' }]]);
    } finally {
      await app.close();
      rmSync(root, { recursive: true, force: true });
    }
  });
});
