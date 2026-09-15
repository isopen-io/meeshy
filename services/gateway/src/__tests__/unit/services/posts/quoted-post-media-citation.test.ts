/**
 * #6578 — UN COMMENTAIRE CITE LE MÉDIA DU POST DONT IL PARLE, ET PEUT Y JOINDRE
 * LES SIENS.
 *
 * Forme de données : la voie `metadata.quotedPostMedia`, AUCUNE colonne — même
 * arbitrage porteur que #6123/#6164 (voie C hybride). Ce qui est FIGÉ ne peut
 * pas devenir un secret : l'ancre du saut et la NATURE du média. Tout le reste
 * — vignette, nom, taille, DURÉE, légende, alt — est RELU à chaque service.
 *
 * Le RANG est load-bearing dans tous les témoins de ce fichier. Écrits sur le
 * PREMIER média, ils ne pourraient PAS tomber : au rang 1, le court-circuit
 * (« le premier média du post ») et la règle juste (« celui qu'on a nommé »)
 * rendent le même verdict. Ils s'écrivent donc sur le DEUXIÈME média d'un post
 * qui en porte quatre — c'est la leçon 261, portée du Prisme à la citation.
 *
 * TOUS les témoins ci-dessous INSTANCIENT, APPELLENT et observent un EFFET. Un
 * témoin qui lirait le texte source resterait vert sur un correctif neutralisé
 * — trois vagues de ce chantier l'ont mesuré.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import {
  parseQuotedPostMedia,
  quotedPostMediaFromMetadata,
  quotedPostMediaKindFor,
  admitQuotedPostMedia,
  QUOTED_POST_MEDIA_FROZEN_FIELDS,
  QUOTED_POST_MEDIA_REVOCABLE_FIELDS,
} from '../../../../services/posts/quotedPostMediaSnapshot';
import {
  hoistQuotedPostMedia,
  serveCitedPostMedia,
} from '../../../../services/posts/citedPostMediaBackfill';

const POST_ID = '507f1f77bcf86cd799439022';
const AUTRE_POST_ID = '507f1f77bcf86cd799439099';
const COMMENT_ID = '507f1f77bcf86cd799439033';

/** Quatre médias sur le post commenté : la citation vise le DEUXIÈME. */
const media = (rang: number, extra: Record<string, unknown> = {}) => ({
  id: `507f1f77bcf86cd79943910${rang}`,
  postId: POST_ID,
  mimeType: 'image/jpeg',
  fileName: `media-${rang}.jpg`,
  originalName: `la photo ${rang}.jpg`,
  fileSize: 1000 * rang,
  duration: 42 * rang,
  fileUrl: `https://cdn/media-${rang}.jpg`,
  thumbnailUrl: `https://cdn/media-${rang}-thumb.jpg`,
  thumbHash: `hash-${rang}`,
  caption: `la légende ${rang}`,
  alt: `alt ${rang}`,
  order: rang - 1,
  ...extra,
});

const QUATRE = [media(1), media(2), media(3), media(4)];
const DEUXIEME = QUATRE[1].id;
const ETRANGER = '507f1f77bcf86cd799439200';

const prismaDouble = (lignes: readonly any[]) => ({
  postMedia: {
    findUnique: jest.fn<any>(async ({ where }: any) => {
      const trouve = lignes.find((m) => m.id === where.id);
      if (!trouve) return null;
      return { id: trouve.id, postId: trouve.postId, mimeType: trouve.mimeType };
    }),
    findMany: jest.fn<any>(async ({ where }: any) =>
      lignes.filter((m) => where.id.in.includes(m.id)),
    ),
  },
});

describe('#6578 — le média NOMMÉ par un commentaire', () => {
  describe('la forme figée et sa liste de champs révocables, au même endroit', () => {
    it('ne fige QUE l’ancre du saut et la nature du média', () => {
      expect([...QUOTED_POST_MEDIA_FROZEN_FIELDS].sort()).toEqual(['kind', 'postMediaId']);
    });

    it('déclare RÉVOCABLES la vignette, le nom, la taille, la DURÉE, la légende et l’alt', () => {
      for (const champ of ['thumbnailUrl', 'fileUrl', 'originalName', 'fileSize', 'duration', 'caption', 'alt']) {
        expect(QUOTED_POST_MEDIA_REVOCABLE_FIELDS as readonly string[]).toContain(champ);
      }
    });

    it('aucun champ révocable ne peut être figé : les deux listes sont disjointes', () => {
      for (const revocable of QUOTED_POST_MEDIA_REVOCABLE_FIELDS) {
        expect(QUOTED_POST_MEDIA_FROZEN_FIELDS as readonly string[]).not.toContain(revocable);
      }
    });

    it('refuse un instantané qui porterait un champ révocable — le premier lecteur qui en fige un de plus est arrêté ici', () => {
      const fige = parseQuotedPostMedia({
        postMediaId: DEUXIEME,
        kind: 'image',
        thumbnailUrl: 'https://cdn/media-2-thumb.jpg',
        caption: 'la légende 2',
        duration: 84,
      });
      expect(fige).not.toBeNull();
      expect(Object.keys(fige!).sort()).toEqual(['kind', 'postMediaId']);
    });

    it('lit la nature depuis le MIME, jamais depuis le nom de fichier', () => {
      expect(quotedPostMediaKindFor('video/mp4')).toBe('video');
      expect(quotedPostMediaKindFor('audio/m4a')).toBe('audio');
      expect(quotedPostMediaKindFor('image/heic')).toBe('image');
      expect(quotedPostMediaKindFor(null)).toBe('file');
    });

    it('relit l’instantané gravé sur le commentaire, et rien d’autre du metadata', () => {
      const relu = quotedPostMediaFromMetadata({
        trackingLinks: [{ url: 'https://x', token: 't' }],
        quotedPostMedia: { postMediaId: DEUXIEME, kind: 'image' },
      });
      expect(relu).toEqual({ postMediaId: DEUXIEME, kind: 'image' });
    });

    it('un commentaire sans citation rend `null` — le champ reste OPTIONNEL', () => {
      expect(quotedPostMediaFromMetadata({ trackingLinks: [] })).toBeNull();
      expect(quotedPostMediaFromMetadata(null)).toBeNull();
    });
  });

  describe('la garde d’écriture — un média étranger au post est REFUSÉ', () => {
    it('ADMET le DEUXIÈME média du post commenté, et dérive sa nature du MIME relu', async () => {
      const prisma = prismaDouble(QUATRE);
      const verdict = await admitQuotedPostMedia(prisma as any, {
        postId: POST_ID,
        quotedPostMedia: { postMediaId: DEUXIEME },
      });
      expect(verdict.ok).toBe(true);
      expect(verdict.snapshot).toEqual({ postMediaId: DEUXIEME, kind: 'image' });
    });

    it('REFUSE un média qui appartient à un AUTRE post — une fuite, pas une faute de frappe', async () => {
      const prisma = prismaDouble([...QUATRE, { ...media(9), id: ETRANGER, postId: AUTRE_POST_ID }]);
      const verdict = await admitQuotedPostMedia(prisma as any, {
        postId: POST_ID,
        quotedPostMedia: { postMediaId: ETRANGER },
      });
      expect(verdict.ok).toBe(false);
      expect(verdict.reason).toMatch(/n’appartient pas au post commenté/);
      expect(verdict.snapshot).toBeUndefined();
    });

    it('REFUSE un média introuvable', async () => {
      const prisma = prismaDouble(QUATRE);
      const verdict = await admitQuotedPostMedia(prisma as any, {
        postId: POST_ID,
        quotedPostMedia: { postMediaId: '507f1f77bcf86cd799439999' },
      });
      expect(verdict.ok).toBe(false);
    });

    it('n’accepte PAS la nature déclarée par le client : un client qui annonce `file` sur une vidéo obtient `video`', async () => {
      const prisma = prismaDouble([media(1), { ...media(2), mimeType: 'video/mp4' }]);
      const verdict = await admitQuotedPostMedia(prisma as any, {
        postId: POST_ID,
        quotedPostMedia: { postMediaId: DEUXIEME, kind: 'file' },
      });
      expect(verdict.ok).toBe(true);
      expect(verdict.snapshot?.kind).toBe('video');
    });

    it('un commentaire qui ne cite aucun média ne coûte AUCUNE requête', async () => {
      const prisma = prismaDouble(QUATRE);
      const verdict = await admitQuotedPostMedia(prisma as any, { postId: POST_ID });
      expect(verdict.ok).toBe(true);
      expect(verdict.snapshot).toBeNull();
      expect(prisma.postMedia.findUnique).not.toHaveBeenCalled();
    });
  });

  describe('le service — la vignette du DEUXIÈME média est RELUE, jamais figée', () => {
    it('sert le média cité avec sa vignette, sa légende et sa durée RELUES', async () => {
      const prisma = prismaDouble(QUATRE);
      const [servi]: any = await serveCitedPostMedia(prisma as any, [
        {
          id: COMMENT_ID,
          postId: POST_ID,
          content: 'celle-là est floue',
          metadata: { quotedPostMedia: { postMediaId: DEUXIEME, kind: 'image' } },
        },
      ]);
      expect(servi.quotedPostMedia).toEqual({ postMediaId: DEUXIEME, kind: 'image' });
      expect(servi.quotedMedia.id).toBe(DEUXIEME);
      expect(servi.quotedMedia.thumbnailUrl).toBe('https://cdn/media-2-thumb.jpg');
      expect(servi.quotedMedia.caption).toBe('la légende 2');
      expect(servi.quotedMedia.duration).toBe(84);
    });

    it('sert la vignette MISE À JOUR, pas celle qui existait à l’écriture du commentaire', async () => {
      const apres = [media(1), { ...media(2), thumbnailUrl: 'https://cdn/recadree.jpg', caption: 'légende corrigée' }];
      const prisma = prismaDouble(apres);
      const [servi]: any = await serveCitedPostMedia(prisma as any, [
        {
          id: COMMENT_ID,
          postId: POST_ID,
          metadata: { quotedPostMedia: { postMediaId: DEUXIEME, kind: 'image' } },
        },
      ]);
      expect(servi.quotedMedia.thumbnailUrl).toBe('https://cdn/recadree.jpg');
      expect(servi.quotedMedia.caption).toBe('légende corrigée');
    });

    it('un média SUPPRIMÉ laisse la citation entière — l’ancre et la nature, rien de descriptif', async () => {
      const prisma = prismaDouble([media(1), media(3), media(4)]);
      const [servi]: any = await serveCitedPostMedia(prisma as any, [
        {
          id: COMMENT_ID,
          postId: POST_ID,
          metadata: { quotedPostMedia: { postMediaId: DEUXIEME, kind: 'image' } },
        },
      ]);
      expect(servi.quotedPostMedia).toEqual({ postMediaId: DEUXIEME, kind: 'image' });
      expect(servi.quotedMedia).toBeUndefined();
    });

    it('FAIL-CLOSED sur une ligne écrite AVANT la garde : un média qui a quitté le post commenté n’est pas servi', async () => {
      const prisma = prismaDouble([...QUATRE, { ...media(9), id: ETRANGER, postId: AUTRE_POST_ID }]);
      const [servi]: any = await serveCitedPostMedia(prisma as any, [
        {
          id: COMMENT_ID,
          postId: POST_ID,
          metadata: { quotedPostMedia: { postMediaId: ETRANGER, kind: 'image' } },
        },
      ]);
      expect(servi.quotedMedia).toBeUndefined();
      expect(servi.quotedPostMedia).toEqual({ postMediaId: ETRANGER, kind: 'image' });
    });

    it('ne sert JAMAIS le porteur du média : la ligne servie a la forme d’un média de post', async () => {
      const prisma = prismaDouble(QUATRE);
      const [servi]: any = await serveCitedPostMedia(prisma as any, [
        { id: COMMENT_ID, postId: POST_ID, metadata: { quotedPostMedia: { postMediaId: DEUXIEME, kind: 'image' } } },
      ]);
      expect(servi.quotedMedia).not.toHaveProperty('postId');
    });

    it('UNE requête pour toute la page, pas une par commentaire', async () => {
      const prisma = prismaDouble(QUATRE);
      const fil = [1, 2, 3, 4].map((rang) => ({
        id: `comment-${rang}`,
        postId: POST_ID,
        metadata: { quotedPostMedia: { postMediaId: QUATRE[rang - 1].id, kind: 'image' } },
      }));
      const servis: any = await serveCitedPostMedia(prisma as any, fil);
      expect(prisma.postMedia.findMany).toHaveBeenCalledTimes(1);
      expect(servis.map((c: any) => c.quotedMedia.id)).toEqual(QUATRE.map((m) => m.id));
    });

    it('NON-RÉGRESSION — les commentaires gravés AVANT le champ se relisent sans perte et sans requête', async () => {
      const prisma = prismaDouble(QUATRE);
      const anciens = [
        { id: 'a', postId: POST_ID, content: 'bravo', metadata: null },
        { id: 'b', postId: POST_ID, content: 'merci', metadata: { trackingLinks: [{ url: 'https://x', token: 't' }] } },
      ];
      const servis: any = await serveCitedPostMedia(prisma as any, anciens);
      expect(servis[0]).toEqual(anciens[0]);
      expect(servis[1]).toEqual(anciens[1]);
      expect(prisma.postMedia.findMany).not.toHaveBeenCalled();
    });

    it('le hoist est PUR : un commentaire cité l’annonce même sans re-lecture', () => {
      const hisse: any = hoistQuotedPostMedia({
        id: COMMENT_ID,
        metadata: { quotedPostMedia: { postMediaId: DEUXIEME, kind: 'image' } },
      });
      expect(hisse.quotedPostMedia).toEqual({ postMediaId: DEUXIEME, kind: 'image' });
    });
  });
});
