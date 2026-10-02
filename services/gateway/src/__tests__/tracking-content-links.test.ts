/**
 * Tests — `TrackingLinkService.collectContentTrackingLinks` (source UNIQUE du
 * mapping `metadata.trackingLinks` partagée par messages/posts/stories/commentaires)
 * et son moteur `processMessageLinks({ rewriteToShortLink: false })`.
 *
 * Prouve :
 *  (a) une URL brute reçoit un mapping `{ url, token }` ;
 *  (b) le contenu N'EST PAS muté (préservation de l'aperçu vidéo + URL lisible) ;
 *  (c) un lien déjà tracé (`m+<token>` / `.../l/<token>`) est ignoré ;
 *  (d) une URL dupliquée dédoublonne en une seule entrée.
 *
 * @jest-environment node
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { TrackingLinkService } from '../services/TrackingLinkService';

type Link = {
  id: string;
  token: string;
  originalUrl: string;
  shortUrl: string;
  isActive: boolean;
  conversationId?: string | null;
};

/**
 * Mock prisma stateful : une URL créée une première fois est ensuite retrouvée
 * par `findExistingTrackingLink` (findFirst) — reproduit la dédup au niveau base
 * qui fait que la 2ᵉ occurrence d'une même URL réutilise le lien existant.
 */
const buildPrisma = () => {
  const store: Link[] = [];
  let seq = 0;

  const trackingLink = {
    // findExistingTrackingLink(originalUrl, conversationId?)
    findFirst: jest.fn(async (arg: any): Promise<Link | null> => {
      const url = arg?.where?.originalUrl;
      return store.find((l) => l.originalUrl === url && l.isActive) ?? null;
    }),
    // tokenExists(token) — always unique in this mock (no collisions)
    findUnique: jest.fn(async (arg: any): Promise<Link | null> => {
      const token = arg?.where?.token;
      return store.find((l) => l.token === token) ?? null;
    }),
    create: jest.fn(async (arg: any): Promise<Link> => {
      seq += 1;
      const link: Link = {
        id: `link${seq}`,
        token: `tok${seq}`,
        originalUrl: arg?.data?.originalUrl,
        shortUrl: arg?.data?.shortUrl ?? `/l/tok${seq}`,
        isActive: true,
        conversationId: arg?.data?.conversationId ?? null,
      };
      store.push(link);
      return link;
    }),
  };

  const prisma: unknown = { trackingLink };
  return prisma as ConstructorParameters<typeof TrackingLinkService>[0] & {
    trackingLink: typeof trackingLink;
    __store: Link[];
  };
};

describe('TrackingLinkService.collectContentTrackingLinks', () => {
  let prisma: ReturnType<typeof buildPrisma>;
  let service: TrackingLinkService;
  beforeEach(() => { prisma = buildPrisma(); service = new TrackingLinkService(prisma); });

  it('(a) mints a { url, token } mapping for a raw http(s) URL', async () => {
    const content = 'Check this out https://example.com/video.mp4 now';
    const links = await service.collectContentTrackingLinks({ content, createdBy: 'u1' });

    expect(links).toEqual([{ url: 'https://example.com/video.mp4', token: 'tok1' }]);
    expect(prisma.trackingLink.create).toHaveBeenCalledTimes(1);
  });

  it('(b) does NOT mutate the content (preview preservation) — processMessageLinks returns the original', async () => {
    const content = 'Watch https://youtu.be/abc123 here';
    const { processedContent, trackingLinks } = await service.processMessageLinks({
      content,
      createdBy: 'u1',
      rewriteToShortLink: false,
    });

    expect(processedContent).toBe(content);
    expect(trackingLinks).toHaveLength(1);
    expect(processedContent).not.toContain('m+');
  });

  it('(c) skips already-tracked m+<token> and /l/<token> URLs (no mint)', async () => {
    const content = 'Already tracked m+abc123 and https://meeshy.me/l/xyz789 — nothing new';
    const links = await service.collectContentTrackingLinks({ content, createdBy: 'u1' });

    expect(links).toEqual([]);
    expect(prisma.trackingLink.create).not.toHaveBeenCalled();
  });

  it('(d) dedups a duplicate URL to a single entry (one token)', async () => {
    const content = 'Same link twice https://example.com/x and again https://example.com/x done';
    const links = await service.collectContentTrackingLinks({ content, createdBy: 'u1' });

    expect(links).toEqual([{ url: 'https://example.com/x', token: 'tok1' }]);
    // The second occurrence reuses the existing link (findFirst hit) — created once.
    expect(prisma.trackingLink.create).toHaveBeenCalledTimes(1);
  });

  it('returns [] for content with no URLs', async () => {
    const links = await service.collectContentTrackingLinks({ content: 'plain text only', createdBy: 'u1' });
    expect(links).toEqual([]);
    expect(prisma.trackingLink.create).not.toHaveBeenCalled();
  });

  it('returns [] (never throws) when the link store fails — non-blocking guarantee', async () => {
    prisma.trackingLink.findFirst.mockRejectedValueOnce(new Error('db down'));
    const links = await service.collectContentTrackingLinks({
      content: 'boom https://example.com/y',
      createdBy: 'u1',
    });
    // processMessageLinks swallows per-URL errors → empty mapping, no throw.
    expect(links).toEqual([]);
  });

  it('maps multiple distinct URLs to distinct tokens', async () => {
    const content = 'One https://a.com/1 two https://b.com/2';
    const links = await service.collectContentTrackingLinks({ content, createdBy: 'u1' });
    expect(links).toEqual([
      { url: 'https://a.com/1', token: 'tok1' },
      { url: 'https://b.com/2', token: 'tok2' },
    ]);
  });
});

/**
 * Le contrat des trois écritures d'un lien (#9093) : `[[url]]` n'est JAMAIS
 * suivi ni réécrit, `[libellé](url)` est suivi par la carte, une URL brute est
 * suivie par la carte — et le contenu stocké n'est jamais réécrit par la loi.
 */
describe('Un lien s\'écrit de trois façons (#9093)', () => {
  let prisma: ReturnType<typeof buildPrisma>;
  let service: TrackingLinkService;
  beforeEach(() => { prisma = buildPrisma(); service = new TrackingLinkService(prisma); });

  it('[[url]] ne crée aucun lien de suivi et la détection brute ne l\'attrape pas', async () => {
    const links = await service.collectContentTrackingLinks({
      content: 'Voir [[https://meeshy.me/brut]] tel quel',
      createdBy: 'u1',
    });

    expect(links).toEqual([]);
    expect(prisma.trackingLink.create).not.toHaveBeenCalled();
  });

  it('[[url]] n\'est plus réécrit en m+<token> par la passerelle des messages', async () => {
    const content = 'Voir [[https://meeshy.me/brut]] tel quel';

    const { processedContent, trackingLinks } = await service.processExplicitLinksInContent({
      content,
      conversationId: 'c1',
      createdBy: 'u1',
    });

    expect(processedContent).toBe(content);
    expect(trackingLinks).toEqual([]);
    expect(prisma.trackingLink.create).not.toHaveBeenCalled();
  });

  it('[libellé](url) entre dans la carte avec son adresse exacte, contenu intact', async () => {
    const content = 'Lis [la suite](https://meeshy.me/notes) puis reviens';

    const { processedContent } = await service.processMessageLinks({
      content,
      createdBy: 'u1',
      rewriteToShortLink: false,
    });
    const links = await service.collectContentTrackingLinks({ content, createdBy: 'u1' });

    expect(processedContent).toBe(content);
    expect(links).toEqual([{ url: 'https://meeshy.me/notes', token: 'tok1' }]);
  });

  it('la parenthèse fermante d\'un lien markdown ne rejoint pas l\'adresse', async () => {
    const links = await service.collectContentTrackingLinks({
      content: '[ici](https://a.com/x)[là](https://b.com/y)',
      createdBy: 'u1',
    });

    expect(links.map((link) => link.url)).toEqual(['https://a.com/x', 'https://b.com/y']);
  });

  it('les trois écritures dans un même texte : seule [[url]] reste hors carte', async () => {
    const links = await service.collectContentTrackingLinks({
      content: 'brut https://a.com/1, [lib](https://b.com/2) et [[https://c.com/3]]',
      createdBy: 'u1',
    });

    expect(links.map((link) => link.url)).toEqual(['https://a.com/1', 'https://b.com/2']);
  });

  it('une même adresse brute ET entre [[ ]] n\'est suivie que pour son occurrence brute', async () => {
    const content = '[[https://a.com/x]] puis https://a.com/x';

    const { processedContent, trackingLinks } = await service.processMessageLinks({ content, createdBy: 'u1' });

    expect(trackingLinks.map((link) => link.originalUrl)).toEqual(['https://a.com/x']);
    expect(processedContent).toBe('[[https://a.com/x]] puis m+tok1');
  });

  it('<url> garde son comportement : suivi et réécrit en m+<token>', async () => {
    const { processedContent } = await service.processExplicitLinksInContent({
      content: 'voir <https://meeshy.me/x>',
      conversationId: 'c1',
      createdBy: 'u1',
    });

    expect(processedContent).toBe('voir m+tok1');
  });
});
