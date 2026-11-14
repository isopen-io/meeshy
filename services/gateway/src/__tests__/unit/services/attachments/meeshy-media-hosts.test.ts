/**
 * #16809 — une image d'identité absolue ne désigne qu'un hôte Meeshy : sinon
 * chaque lecteur d'une communauté publique livrerait son IP et son navigateur
 * à l'hôte que le créateur a choisi.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import { isMeeshyMediaUrl, meeshyMediaHostsFromEnv } from '../../../../services/attachments/meeshyMediaHosts';
import { identityImageIsCallers } from '../../../../services/attachments/identityImageOwnership';

const USER_ID = '507f1f77bcf86cd799439011';
const OWN = '2026/11/507f1f77bcf86cd799439011/avatar_neuf.webp';
const HOSTS = new Set(['gate.meeshy.me', 'gate.staging.meeshy.me']);

function ownerPrisma() {
  return {
    messageAttachment: {
      findFirst: jest.fn<any>().mockImplementation(async ({ where }: any) =>
        where.uploadedBy === USER_ID && where.OR.some((c: any) => c.filePath === OWN) ? { id: 'att-own' } : null,
      ),
    },
  };
}

describe('meeshyMediaHostsFromEnv — les hôtes de médias de CE déploiement', () => {
  it('lit PUBLIC_URL, API_PUBLIC_URL, BACKEND_URL et MEESHY_MEDIA_HOSTS, et garde toujours gate.meeshy.me', () => {
    const hosts = meeshyMediaHostsFromEnv({
      PUBLIC_URL: 'https://gate.staging.meeshy.me',
      API_PUBLIC_URL: 'https://api.example-deploy.test/',
      BACKEND_URL: 'http://localhost:3000',
      MEESHY_MEDIA_HOSTS: ' media.meeshy.me , Static.Meeshy.me ',
    });
    expect([...hosts].sort()).toEqual([
      'api.example-deploy.test',
      'gate.meeshy.me',
      'gate.staging.meeshy.me',
      'localhost:3000',
      'media.meeshy.me',
      'static.meeshy.me',
    ]);
  });

  it("ignore une variable illisible plutôt que d'admettre quoi que ce soit", () => {
    expect([...meeshyMediaHostsFromEnv({ PUBLIC_URL: 'pas une adresse', MEESHY_MEDIA_HOSTS: '' })]).toEqual(['gate.meeshy.me']);
  });
});

describe('isMeeshyMediaUrl', () => {
  it.each([
    'https://gate.meeshy.me/api/v1/attachments/file/x',
    'https://GATE.meeshy.me/api/v1/attachments/file/x',
    'http://gate.staging.meeshy.me/api/v1/attachments/file/x',
  ])('admet %s', (url) => {
    expect(isMeeshyMediaUrl(url, HOSTS)).toBe(true);
  });

  it.each([
    ['un hôte tiers', 'https://cdn.example.com/a.png'],
    ['un sous-domaine de façade', 'https://gate.meeshy.me.evil.test/api/v1/attachments/file/x'],
    ["un hôte caché derrière des identifiants", 'https://gate.meeshy.me@evil.test/api/v1/attachments/file/x'],
    ['des identifiants devant un hôte Meeshy', 'https://u:p@gate.meeshy.me/api/v1/attachments/file/x'],
    ['un autre port', 'https://gate.meeshy.me:8443/api/v1/attachments/file/x'],
    ['un autre schéma', 'ftp://gate.meeshy.me/x'],
    ['une adresse illisible', 'https://'],
  ])('refuse %s', (_label, url) => {
    expect(isMeeshyMediaUrl(url, HOSTS)).toBe(false);
  });
});

describe("identityImageIsCallers — l'hôte avant le fichier (#16809)", () => {
  it("refuse un hôte tiers, sans lecture", async () => {
    const prisma = ownerPrisma();
    const ok = await identityImageIsCallers(prisma as any, { userId: USER_ID, reference: 'https://cdn.example.com/a.png', mediaHosts: HOSTS });
    expect(ok).toBe(false);
    expect(prisma.messageAttachment.findFirst).not.toHaveBeenCalled();
  });

  it("refuse son PROPRE fichier servi par un hôte tiers", async () => {
    const prisma = ownerPrisma();
    const ok = await identityImageIsCallers(prisma as any, {
      userId: USER_ID, reference: `https://evil.test/api/v1/attachments/file/${encodeURIComponent(OWN)}`, mediaHosts: HOSTS,
    });
    expect(ok).toBe(false);
    expect(prisma.messageAttachment.findFirst).not.toHaveBeenCalled();
  });

  it('refuse une route Meeshy qui ne sert aucun fichier', async () => {
    const prisma = ownerPrisma();
    const ok = await identityImageIsCallers(prisma as any, { userId: USER_ID, reference: 'https://gate.meeshy.me/api/v1/users/me', mediaHosts: HOSTS });
    expect(ok).toBe(false);
  });

  it('admet son propre fichier sur un hôte Meeshy', async () => {
    const prisma = ownerPrisma();
    const ok = await identityImageIsCallers(prisma as any, {
      userId: USER_ID, reference: `https://gate.staging.meeshy.me/api/v1/attachments/file/${encodeURIComponent(OWN)}`, mediaHosts: HOSTS,
    });
    expect(ok).toBe(true);
  });

  it("garde la valeur DÉJÀ posée, même d'un hôte tiers (lecture tolérante)", async () => {
    const prisma = ownerPrisma();
    const ok = await identityImageIsCallers(prisma as any, {
      userId: USER_ID, reference: 'https://cdn.example.com/a.png', current: 'https://cdn.example.com/a.png', mediaHosts: HOSTS,
    });
    expect(ok).toBe(true);
  });

  it("lit les hôtes de l'environnement quand l'appelant n'en passe pas", async () => {
    const prisma = ownerPrisma();
    const ok = await identityImageIsCallers(prisma as any, {
      userId: USER_ID, reference: `https://gate.meeshy.me/api/v1/attachments/file/${encodeURIComponent(OWN)}`,
    });
    expect(ok).toBe(true);
  });
});
