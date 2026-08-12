/**
 * Tests — intégrité du contenu face aux séquences `$` dans le traitement des
 * liens de tracking (`TrackingLinkService.processExplicitLinksInContent` et
 * `processMessageLinks`).
 *
 * `String.prototype.replace(search, replacementString)` interprète `$$`, `$&`,
 * `` $` `` et `$'` dans la chaîne de remplacement — que la recherche soit une
 * chaîne ou une regex. Or ce service réinjecte du texte contrôlé par
 * l'utilisateur (lien markdown protégé restauré à l'ÉTAPE 4, URL brute réécrite
 * en repli d'erreur) comme *replacement string*. Un `$`-sequence tapé dans un
 * lien était donc mutilé AVANT persistance et fan-out — même classe de défaut
 * que le correctif `processLinksInContent` (MessagingService), ici sur le
 * chemin tracking-link.
 *
 *   "[a$&b](https://x.com)" -> "[a__PROTECTED_MD_0__b](https://x.com)" (fuite sentinelle)
 *   "[$$ x](https://x.com)" -> "[$ x](https://x.com)"                   ($ avalé)
 *
 * @jest-environment node
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { TrackingLinkService } from '../../../services/TrackingLinkService';

type Link = {
  id: string;
  token: string;
  originalUrl: string;
  shortUrl: string;
  isActive: boolean;
  conversationId?: string | null;
};

const buildPrisma = () => {
  const store: Link[] = [];
  let seq = 0;

  const trackingLink = {
    findFirst: jest.fn(async (arg: any): Promise<Link | null> => {
      const url = arg?.where?.originalUrl;
      return store.find((l) => l.originalUrl === url && l.isActive) ?? null;
    }),
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
  };
};

describe('TrackingLinkService — content integrity with $-sequences', () => {
  let prisma: ReturnType<typeof buildPrisma>;
  let service: TrackingLinkService;
  beforeEach(() => {
    prisma = buildPrisma();
    service = new TrackingLinkService(prisma);
  });

  describe('processExplicitLinksInContent — protected markdown restore (STEP 4)', () => {
    it('preserves $& in a markdown link verbatim (no sentinel leak)', async () => {
      const content = '[a$&b](https://x.com)';
      const { processedContent, trackingLinks } = await service.processExplicitLinksInContent({
        content,
        conversationId: 'c1',
      });

      expect(processedContent).toBe(content);
      expect(processedContent).not.toContain('__PROTECTED_MD_');
      expect(trackingLinks).toHaveLength(0);
    });

    it('preserves a literal $$ in a markdown link verbatim (no $ swallowed)', async () => {
      const content = '[$$ deal](https://x.com)';
      const { processedContent } = await service.processExplicitLinksInContent({
        content,
        conversationId: 'c1',
      });

      expect(processedContent).toBe(content);
    });

    it("preserves $' and $` in a markdown link verbatim", async () => {
      const content = "before [x$'y$`z](https://x.com) after";
      const { processedContent } = await service.processExplicitLinksInContent({
        content,
        conversationId: 'c1',
      });

      expect(processedContent).toBe(content);
    });

    it('leaves a plain markdown link (no $) unchanged — non-regression', async () => {
      const content = 'see [click here](https://x.com) now';
      const { processedContent } = await service.processExplicitLinksInContent({
        content,
        conversationId: 'c1',
      });

      expect(processedContent).toBe(content);
    });
  });

  describe('processExplicitLinksInContent — raw-URL error fallback (STEP 2/3 catch)', () => {
    it('restores the bracketed URL verbatim when it contains $ and minting fails', async () => {
      prisma.trackingLink.create.mockRejectedValueOnce(new Error('db down'));
      const content = '[[https://x.com/?q=$&a$$b]]';
      const { processedContent } = await service.processExplicitLinksInContent({
        content,
        conversationId: 'c1',
      });

      // On error the [[...]] wrapper is stripped and the raw URL restored verbatim.
      expect(processedContent).toBe('https://x.com/?q=$&a$$b');
    });

    it('restores an angle-bracketed URL verbatim when it contains $ and minting fails', async () => {
      // Même repli, autre syntaxe : `<url>` a son propre `catch` (ÉTAPE 3) et
      // sa propre réinjection de l'URL comme *replacement*.
      prisma.trackingLink.create.mockRejectedValueOnce(new Error('db down'));
      const content = '<https://x.com/pay?amt=$5&ref=$&x>';
      const { processedContent } = await service.processExplicitLinksInContent({
        content,
        conversationId: 'c1',
      });

      expect(processedContent).toBe('https://x.com/pay?amt=$5&ref=$&x');
    });
  });
});
