/**
 * **#20711 — UNE DIFFUSION DE PUBLICATION NE RÉINJECTE PLUS LA SOURCE
 * REPUBLIÉE NI L'APERÇU DES COMMENTAIRES D'UN AUTEUR SÉPARÉ DU LECTEUR.**
 *
 * #16894 puis #20204 ont fermé les douze portes REST (dix listes, la fiche, la
 * découverte des statuts) qui servaient DANS un post deux contenus d'AUTRES
 * auteurs : la source d'une republication (`repostOf`) et l'aperçu des
 * commentaires (`comments`, trois au plus). La loi se pose sur le LECTEUR
 * (`WireReader.separatedUserIds`) et s'applique dans `withMentions` →
 * `withoutSeparatedCompanions`.
 *
 * **Une diffusion n'a pas de lecteur** : `WIRE_BROADCAST` ne porte aucune
 * séparation, par construction. Les sept familles de `emitPostToAudience`
 * servent donc ces compagnons à TOUTE leur audience — et le web fusionne la
 * charge reçue par-dessus sa carte, donc **la diffusion réinjecte ce que le
 * REST vient de retirer**, sur un déclencheur fait par un TIERS.
 *
 * Vecteur : A a bloqué B. Une publication de C republie un post de B, ou porte
 * un commentaire de B dans son aperçu. C édite sa publication. A reçoit
 * `post:updated` avec le contenu de B et l'écrit par-dessus sa carte.
 *
 * ─── CE QUE CES TÉMOINS N'ASSERTENT PAS ──────────────────────────────────
 *
 * Ils ne portent RIEN sur l'auteur du post lui-même : cet axe est celui de
 * #20430 (la room du post), dont les témoins vivent dans
 * `post-contenu-separe-20430.test.ts`. Ici l'auteur du post n'est séparé de
 * personne, et c'est délibéré — un témoin qui mélange les deux axes ne dit
 * plus lequel des deux il garde.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import type { PrismaClient } from '@meeshy/shared/prisma/client';

import { SocialEventsHandler } from '../SocialEventsHandler';
import { resetSeparationCacheForTests } from '../../separatedRooms';

jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: { child: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }) },
}));

/** C publie, A lit, B est le COMPAGNON — republié ou commentateur. */
const AUTEUR = 'auteur-C-20711';
const LECTEUR = 'lecteur-A-20711';
/** Séparé de D, et de D SEULEMENT : sans lui, « chacun sa charge » et « la charge
 *  amputée de TOUS les compagnons » rendent le même verdict, et le témoin de
 *  précision ne peut pas tomber (mutation M3 du lot : l'union des sujets au lieu
 *  des sujets du lecteur laissait 77 témoins verts). */
const LECTEUR_2 = 'lecteur-Z-20711';
const COMPAGNON = 'compagnon-B-20711';
const AUTRE_COMPAGNON = 'compagnon-D-20711';
const POST_ID = '507f191e810c19729de20711';

const TEXTE_REPUBLIE = 'le texte republié de B que A ne doit pas recevoir';
const TEXTE_COMMENTE = 'le commentaire de B que A ne doit pas recevoir';
const TEXTE_AUTRE = 'le commentaire de D, que rien ne sépare de A';

type Emission = { evenement: string; rooms: string[]; exclues: string[]; charge: any };
/**
 * `'panne'` fait lever TOUTE lecture de blocage — l'audience comme la loi.
 * `'panne-compagnons'` ne fait lever QUE la lecture de séparation (`hasSome`).
 *
 * **La distinction n'est pas un raffinement : sans elle le témoin de fermeture
 * est une décoration.** Sous `'panne'`, le pré-filtre des feed rooms tombe
 * aussi, son `catch` ne rend que l'auteur, et le lecteur n'est JAMAIS dans
 * l'audience — bloqué ou non, fuite ou pas. Mesuré en livrant le lot : rendre
 * la fermeture fail-OUVERTE laissait les 77 témoins verts. C'est le constat C9
 * de #20430, qui frappe ici une seconde fois, sur l'autre lecture.
 */
type Blocages = Readonly<Record<string, readonly string[]>> | 'panne' | 'panne-compagnons';

/**
 * Même double que `post-contenu-separe-20430.test.ts`, et pour les mêmes
 * raisons : il alimente l'audience (amis acceptés), le pré-filtre
 * bidirectionnel des feed rooms, et la loi de séparation.
 */
function fauxPrisma(blocages: Blocages) {
  const carte = (): Readonly<Record<string, readonly string[]>> =>
    typeof blocages === 'string' ? {} : blocages;
  return {
    user: {
      findMany: jest.fn(async (args: any) => {
        if (blocages === 'panne') throw new Error('mongo indisponible');
        if (args?.where?.blockedUserIds?.hasSome) {
          if (blocages === 'panne-compagnons') throw new Error('mongo indisponible');
          const sujets: string[] = args.where.blockedUserIds.hasSome;
          return Object.entries(carte())
            .filter(([, cibles]) => cibles.some((c) => sujets.includes(c)))
            .map(([b, cibles]) => ({ id: b, blockedUserIds: [...cibles] }));
        }
        if (args?.where?.blockedUserIds?.has) {
          const cible: string = args.where.blockedUserIds.has;
          const candidats: string[] = args?.where?.id?.in ?? [];
          return candidats.filter((id) => (carte()[id] ?? []).includes(cible)).map((id) => ({ id }));
        }
        const ids: string[] = args?.where?.id?.in ?? [];
        return ids.map((id) => ({ id, blockedUserIds: [...(carte()[id] ?? [])] }));
      }),
      findUnique: jest.fn(async (args: any) => {
        if (blocages === 'panne') throw new Error('mongo indisponible');
        return { blockedUserIds: [...(carte()[args?.where?.id] ?? [])] };
      }),
    },
    userRelation: { findMany: jest.fn(async () => []) },
    friendRequest: {
      findMany: jest.fn(async () => [
        { senderId: AUTEUR, receiverId: LECTEUR, status: 'accepted', updatedAt: new Date('2026-11-28T00:00:00Z') },
        { senderId: AUTEUR, receiverId: LECTEUR_2, status: 'accepted', updatedAt: new Date('2026-11-28T00:00:00Z') },
      ]),
    },
  } as unknown as PrismaClient;
}

function fauxIo(emissions: Emission[]) {
  const operateur = (rooms: string[], exclues: string[]): any => ({
    to: (r: string | string[]) => operateur([...rooms, ...[r].flat()], exclues),
    except: (r: string | string[]) => operateur(rooms, [...exclues, ...[r].flat()]),
    emit: (evenement: string, data: unknown) => {
      emissions.push({ evenement, rooms, exclues, charge: JSON.parse(JSON.stringify(data)) });
      return true;
    },
  });
  return { to: (r: string | string[]) => operateur([r].flat(), []) };
}

/** Un post de C qui REPUBLIE un post de B. */
const avecRepost = (type: string) => ({
  id: POST_ID,
  authorId: AUTEUR,
  type,
  content: 'le texte de C, parfaitement lisible par A',
  visibility: 'PUBLIC',
  visibilityUserIds: [],
  communityId: null,
  mediaItems: [],
  repostOf: { id: 'post-de-B', authorId: COMPAGNON, author: { id: COMPAGNON, username: 'b' }, content: TEXTE_REPUBLIE },
} as any);

/** Un post de C qui porte en aperçu un commentaire de B et un de D. */
const avecCommentaires = (type: string) => ({
  id: POST_ID,
  authorId: AUTEUR,
  type,
  content: 'le texte de C, parfaitement lisible par A',
  visibility: 'PUBLIC',
  visibilityUserIds: [],
  communityId: null,
  mediaItems: [],
  comments: [
    { id: 'c-de-B', author: { id: COMPAGNON, username: 'b' }, content: TEXTE_COMMENTE },
    { id: 'c-de-D', author: { id: AUTRE_COMPAGNON, username: 'd' }, content: TEXTE_AUTRE },
  ],
} as any);

async function diffuser(blocages: Blocages, quoi: (h: SocialEventsHandler) => Promise<void>) {
  const emissions: Emission[] = [];
  const handler = new SocialEventsHandler({ io: fauxIo(emissions) as any, prisma: fauxPrisma(blocages) });
  await quoi(handler);
  return emissions;
}

/** Ce que le LECTEUR reçoit vraiment : sa feed room, moins ce qui l'exclut. */
const recuParLeLecteur = (emissions: Emission[]) =>
  emissions.filter(
    (e) =>
      (e.rooms.includes(`feed:${LECTEUR}`) || e.rooms.includes(`post:${POST_ID}`)) &&
      !e.exclues.includes(`user:${LECTEUR}`)
  );

const texteRecuParLeLecteur = (emissions: Emission[]) => JSON.stringify(recuParLeLecteur(emissions));

const recuParLeSecondLecteur = (emissions: Emission[]) =>
  emissions.filter((e) => e.rooms.includes(`feed:${LECTEUR_2}`) && !e.exclues.includes(`user:${LECTEUR_2}`));

const texteRecuParLeSecondLecteur = (emissions: Emission[]) => JSON.stringify(recuParLeSecondLecteur(emissions));

/** Les sept familles qui portent un `Post` entier à leur audience. */
const famillesRepost: ReadonlyArray<readonly [string, (h: SocialEventsHandler, p: any) => Promise<void>]> = [
  ['post:created', (h, p) => h.broadcastPostCreated(p, AUTEUR)],
  ['post:updated', (h, p) => h.broadcastPostUpdated(p, AUTEUR)],
  ['post:reposted', (h, p) => h.broadcastPostReposted({ originalPostId: 'post-de-B', repost: p } as any, AUTEUR)],
  ['story:created', (h, p) => h.broadcastStoryCreated({ ...p, type: 'STORY' }, AUTEUR)],
  ['story:updated', (h, p) => h.broadcastStoryUpdated({ ...p, type: 'STORY' }, AUTEUR)],
  ['status:created', (h, p) => h.broadcastStatusCreated({ ...p, type: 'STATUS' }, AUTEUR)],
  ['status:updated', (h, p) => h.broadcastStatusUpdated({ ...p, type: 'STATUS' }, AUTEUR)],
];

beforeEach(() => {
  resetSeparationCacheForTests();
  jest.clearAllMocks();
});

describe('#20711 — les compagnons d’un post diffusé', () => {
  describe.each(famillesRepost)('%s — la SOURCE republiée', (_nom, diffusion) => {
    it('SANS blocage, le lecteur reçoit bien la source republiée', async () => {
      const emissions = await diffuser({}, (h) => diffusion(h, avecRepost('POST')));
      expect(recuParLeLecteur(emissions).length).toBeGreaterThan(0);
      expect(texteRecuParLeLecteur(emissions)).toContain(TEXTE_REPUBLIE);
    });

    it('quand le LECTEUR a bloqué l’auteur republié, la source ne lui part plus', async () => {
      const emissions = await diffuser({ [LECTEUR]: [COMPAGNON] }, (h) => diffusion(h, avecRepost('POST')));
      expect(texteRecuParLeLecteur(emissions)).not.toContain(TEXTE_REPUBLIE);
    });

    it('quand l’auteur republié a bloqué le LECTEUR, la source ne lui part plus', async () => {
      const emissions = await diffuser({ [COMPAGNON]: [LECTEUR] }, (h) => diffusion(h, avecRepost('POST')));
      expect(texteRecuParLeLecteur(emissions)).not.toContain(TEXTE_REPUBLIE);
    });

    it('la carte reste RENDABLE : `repostOf` sort à `null`, jamais absent', async () => {
      const emissions = await diffuser({ [LECTEUR]: [COMPAGNON] }, (h) => diffusion(h, avecRepost('POST')));
      const recu = recuParLeLecteur(emissions);
      expect(recu.length).toBeGreaterThan(0);
      for (const e of recu) {
        const post = e.charge.post ?? e.charge.story ?? e.charge.status ?? e.charge.repost;
        expect(post).toBeDefined();
        expect('repostOf' in post).toBe(true);
        expect(post.repostOf).toBeNull();
      }
    });

    it('le TEXTE de l’auteur du post, lui, continue d’arriver', async () => {
      const emissions = await diffuser({ [LECTEUR]: [COMPAGNON] }, (h) => diffusion(h, avecRepost('POST')));
      expect(texteRecuParLeLecteur(emissions)).toContain('le texte de C, parfaitement lisible par A');
    });

    it('une lecture de séparation IMPOSSIBLE ne sert rien à l’audience — fermé, jamais ouvert', async () => {
      const emissions = await diffuser('panne-compagnons', (h) => diffusion(h, avecRepost('POST')));
      expect(recuParLeLecteur(emissions)).toHaveLength(0);
      expect(texteRecuParLeLecteur(emissions)).not.toContain(TEXTE_REPUBLIE);
    });

    it('… et l’AUTEUR garde son écho, INCHANGÉ, même sur cette panne', async () => {
      const emissions = await diffuser('panne-compagnons', (h) => diffusion(h, avecRepost('POST')));
      const sien = emissions.filter((e) => e.rooms.includes(`feed:${AUTEUR}`));
      expect(sien).toHaveLength(1);
      expect(JSON.stringify(sien)).toContain(TEXTE_REPUBLIE);
    });
  });

  describe.each(famillesRepost)('%s — l’APERÇU des commentaires', (_nom, diffusion) => {
    it('SANS blocage, les deux commentaires arrivent', async () => {
      const emissions = await diffuser({}, (h) => diffusion(h, avecCommentaires('POST')));
      const texte = texteRecuParLeLecteur(emissions);
      expect(texte).toContain(TEXTE_COMMENTE);
      expect(texte).toContain(TEXTE_AUTRE);
    });

    it('le commentaire de l’auteur SÉPARÉ sort de l’aperçu — et lui seul', async () => {
      const emissions = await diffuser({ [LECTEUR]: [COMPAGNON] }, (h) => diffusion(h, avecCommentaires('POST')));
      const texte = texteRecuParLeLecteur(emissions);
      expect(texte).not.toContain(TEXTE_COMMENTE);
      expect(texte).toContain(TEXTE_AUTRE);
    });

    it('une lecture de séparation IMPOSSIBLE ne sert rien à l’audience', async () => {
      const emissions = await diffuser('panne-compagnons', (h) => diffusion(h, avecCommentaires('POST')));
      expect(recuParLeLecteur(emissions)).toHaveLength(0);
      expect(texteRecuParLeLecteur(emissions)).not.toContain(TEXTE_COMMENTE);
    });

    it('CHACUN sa charge : A perd le commentaire de B, Z perd celui de D, et aucun les deux', async () => {
      const emissions = await diffuser(
        { [LECTEUR]: [COMPAGNON], [LECTEUR_2]: [AUTRE_COMPAGNON] },
        (h) => diffusion(h, avecCommentaires('POST'))
      );
      const pourA = texteRecuParLeLecteur(emissions);
      const pourZ = texteRecuParLeSecondLecteur(emissions);
      expect(pourA).not.toContain(TEXTE_COMMENTE);
      expect(pourA).toContain(TEXTE_AUTRE);
      expect(pourZ).toContain(TEXTE_COMMENTE);
      expect(pourZ).not.toContain(TEXTE_AUTRE);
    });
  });

  describe('le coût du cas nominal', () => {
    it('un post SANS compagnon ne paie AUCUNE lecture de séparation de compagnon', async () => {
      const emissions: Emission[] = [];
      const prisma = fauxPrisma({});
      const handler = new SocialEventsHandler({ io: fauxIo(emissions) as any, prisma });
      const sansCompagnon = { ...avecRepost('POST'), repostOf: null, comments: [] };
      await handler.broadcastPostCreated(sansCompagnon, AUTEUR);
      const lectures = (prisma.user.findMany as any).mock.calls.filter(
        (c: any[]) => c[0]?.where?.blockedUserIds?.hasSome !== undefined
      );
      expect(lectures).toHaveLength(0);
    });
  });
});
