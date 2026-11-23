/**
 * **#20430 — LE CONTENU D'UN POST SE TAIT CHEZ QUI UN BLOCAGE SÉPARE DE SON
 * AUTEUR, DANS LA ROOM DU POST AUSSI.**
 *
 * #20216 a fermé le CONTENU d'un commentaire ; #20236, #20338 et #20429 ont
 * fermé les huit familles d'ACTIVITÉ. Le contenu du POST lui-même restait
 * ouvert — et il est la charge la plus lourde des trois : le `Post` entier.
 *
 * ─── OÙ EST LA FUITE, EXACTEMENT ─────────────────────────────────────────
 *
 * Les FEED rooms étaient déjà gardées, et dans les DEUX SENS :
 * `getVisibilityFilteredRecipients` passe par `withoutBlockedRecipients` →
 * `getBlockedUserIdsAmong`, qui lit « qui m'a bloqué » ET « qui j'ai bloqué »
 * parmi les candidats. L'issue annonçait « seulement les blocages de
 * l'AUTEUR » : mesuré, c'est bidirectionnel.
 *
 * La fuite est **`ROOMS.post(postId)`, que rien ne filtrait** — et elle est
 * réelle parce que **poser un blocage n'évince aucune socket d'une room de
 * post** : `routes/directory/blocks.ts` n'appelle que
 * `invalidateSeparationAround`, il n'existe aucun `socketsLeave` sur une room
 * de post, et la porte de `post:join` filtre au moment du JOIN. Le fichier de
 * production écrivait déjà cette prémisse, pour une autre raison — « si
 * l'édition RESTREINT la visibilité, les membres déjà joints à la post room
 * reçoivent encore cette update ».
 *
 * Vecteur : un lecteur ouvre le détail d'un post (il rejoint la room), bloque
 * l'auteur, l'auteur édite ⇒ le lecteur reçoit le nouveau contenu en direct.
 *
 * ─── QUATRE SITES, PAS NEUF — L'ISSUE SE TROMPAIT ────────────────────────
 *
 * L'issue annonçait que les SIX familles de `emitPostToAudience` portent le
 * Post « vers `ROOMS.post` ». **Mesuré : une seule le fait.** Le paramètre
 * `postRoomId` est OPTIONNEL, et seul `broadcastPostUpdated` le passe ; les
 * cinq autres (`post:created`, `story:created`, `story:updated`,
 * `status:created`, `status:updated`) tombent dans la branche `else`, une
 * boucle par feed room qui n'adresse JAMAIS la room du post. Leurs feed rooms
 * étant déjà filtrées dans les deux sens, elles ne fuient pas.
 *
 * Les sites qui atteignent vraiment la room du post sont donc QUATRE :
 * `post:updated`, et les trois traductions via `emitToFeedsAndPostRoom`.
 * Les témoins de ce fichier sont rangés par ce que chaque famille ATTEINT,
 * et non par la famille à laquelle elle appartient — les cinq autres sont
 * gelées sur « n'adresse aucune room de post », pour qu'un lot qui leur
 * ajouterait `postRoomId` sans séparation fasse rougir ce fichier.
 *
 * ─── LES TROIS TRADUCTIONS NE SONT PAS DES EXEMPTIONS ────────────────────
 *
 * Le critère de fin de l'issue les donnait pour légitimes, « parce qu'elles ne
 * nomment personne ». **Mesuré : les trois portent `translation.text`** — le
 * contenu du post dans une autre langue. Ne nommer personne et ne porter aucun
 * contenu sont deux propriétés différentes, et c'est la seconde qui décide.
 *
 * Et l'asymétrie est à CINQ LIGNES d'intervalle, dans la même méthode : sur
 * `media:caption-translation-updated` comme sur `media:alt-translation-updated`,
 * la branche `if (data.commentId)` passe par `commentEmitter` (gardée depuis
 * #20216) et la branche du POST par `NOTHING_TO_SILENCE`. Le même texte traduit
 * est tu pour un commentaire et servi pour un post.
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

const AUTEUR = 'auteur-post-20430';
const LECTEUR = 'lecteur-room-20430';
const POST_ID = '507f191e810c19729de20430';

type Emission = { evenement: string; rooms: string[]; exclues: string[]; charge: any };
type Blocages = Readonly<Record<string, readonly string[]>> | 'panne';

/**
 * `LECTEUR` est ami de `AUTEUR` — c'est ce qui le met dans l'audience — et il
 * est DANS la room du post. Le double de blocage ne sert que la loi de
 * séparation ; le pré-filtre des feed rooms est exercé par ses propres témoins.
 */
function fauxPrisma(blocages: Blocages) {
  const carte = () => (blocages === 'panne' ? {} : blocages);
  const bloqueursDe = (sujets: readonly string[]) =>
    Object.entries(carte())
      .filter(([, cibles]) => cibles.some((c) => sujets.includes(c)))
      .map(([b]) => ({ id: b }));
  return {
    user: {
      findMany: jest.fn(async (args: any) => {
        if (blocages === 'panne') throw new Error('mongo indisponible');
        if (args?.where?.blockedUserIds?.hasSome) return bloqueursDe(args.where.blockedUserIds.hasSome);
        if (args?.where?.blockedUserIds?.has) return [];
        const ids: string[] = args?.where?.id?.in ?? [];
        return ids.map((id) => ({ id, blockedUserIds: [...(carte()[id] ?? [])] }));
      }),
      findUnique: jest.fn(async () => ({ blockedUserIds: [] })),
    },
    friendRequest: {
      findMany: jest.fn(async () => [
        { senderId: AUTEUR, receiverId: LECTEUR, status: 'accepted' },
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

const unPost = (type: string) => ({
  id: POST_ID,
  authorId: AUTEUR,
  type,
  content: 'le texte que le lecteur séparé ne doit pas recevoir',
  visibility: 'PUBLIC',
  visibilityUserIds: [],
  communityId: null,
  mediaItems: [],
} as any);

const traduction = (extra: Record<string, unknown> = {}) => ({
  postId: POST_ID,
  language: 'en',
  translation: { text: 'the text a separated reader must not receive', translationModel: 'nllb', createdAt: '2026-11-23T00:00:00Z' },
  ...extra,
});

/** Ce qui ARRIVE dans la room du post : l'adresse que rien ne filtrait. */
const recuDansLaRoomDuPost = (emissions: Emission[]) =>
  emissions.filter((e) => e.rooms.includes(`post:${POST_ID}`) && !e.exclues.includes(`user:${LECTEUR}`));

/** Ce qui arrive à l'AUTEUR, qui ne se tait jamais à lui-même. */
const recuParLAuteur = (emissions: Emission[]) =>
  emissions.filter((e) => e.rooms.includes(`feed:${AUTEUR}`));

async function diffuser(blocages: Blocages, quoi: (h: SocialEventsHandler) => Promise<void>) {
  const emissions: Emission[] = [];
  const handler = new SocialEventsHandler({ io: fauxIo(emissions) as any, prisma: fauxPrisma(blocages) });
  await quoi(handler);
  return emissions;
}

/** La SEULE famille de `emitPostToAudience` qui adresse la room du post. */
const versLaRoomDuPost: ReadonlyArray<readonly [string, (h: SocialEventsHandler) => Promise<void>]> = [
  ['post:updated', (h) => h.broadcastPostUpdated(unPost('POST'), AUTEUR)],
];

/** Les cinq qui ne l'adressent PAS — fait mesuré, gelé ici. */
const sansRoomDePost: ReadonlyArray<readonly [string, (h: SocialEventsHandler) => Promise<void>]> = [
  ['post:created', (h) => h.broadcastPostCreated(unPost('POST'), AUTEUR)],
  ['story:created', (h) => h.broadcastStoryCreated(unPost('STORY'), AUTEUR)],
  ['story:updated', (h) => h.broadcastStoryUpdated(unPost('STORY'), AUTEUR)],
  ['status:created', (h) => h.broadcastStatusCreated(unPost('STATUS'), AUTEUR)],
  ['status:updated', (h) => h.broadcastStatusUpdated(unPost('STATUS'), AUTEUR)],
];

/** Les trois traductions de POST, qui portent `translation.text`. */
const traductions: ReadonlyArray<readonly [string, (h: SocialEventsHandler) => Promise<void>]> = [
  ['post:translation-updated', (h) => h.broadcastPostTranslationUpdated(traduction() as any, AUTEUR, 'PUBLIC', [])],
  ['media:caption-translation-updated', (h) => h.broadcastMediaCaptionTranslationUpdated(traduction({ mediaId: 'm-1' }) as any, AUTEUR, 'PUBLIC', [])],
  ['media:alt-translation-updated', (h) => h.broadcastMediaAltTranslationUpdated(traduction({ mediaId: 'm-1' }) as any, AUTEUR, 'PUBLIC', [])],
];

beforeEach(() => {
  resetSeparationCacheForTests();
  jest.clearAllMocks();
});

describe('#20430 — le CONTENU d’un post et la room du post', () => {
  describe.each(versLaRoomDuPost)('%s — atteint la room du post', (_nom, diffusion) => {
    it('SANS blocage, la room du post reçoit bien le contenu', async () => {
      const emissions = await diffuser({}, diffusion);
      expect(recuDansLaRoomDuPost(emissions)).toHaveLength(1);
    });

    it('quand le LECTEUR a bloqué l’auteur, la room du post ne le lui sert plus', async () => {
      const emissions = await diffuser({ [LECTEUR]: [AUTEUR] }, diffusion);
      expect(recuDansLaRoomDuPost(emissions)).toHaveLength(0);
    });

    it('quand l’AUTEUR a bloqué le lecteur, la room du post ne le lui sert plus', async () => {
      const emissions = await diffuser({ [AUTEUR]: [LECTEUR] }, diffusion);
      expect(recuDansLaRoomDuPost(emissions)).toHaveLength(0);
    });

    it('le TEXTE du post ne part pas quand un blocage sépare', async () => {
      const emissions = await diffuser({ [LECTEUR]: [AUTEUR] }, diffusion);
      const versLaRoom = JSON.stringify(emissions.filter((e) => e.rooms.includes(`post:${POST_ID}`) && !e.exclues.includes(`user:${LECTEUR}`)));
      expect(versLaRoom).not.toContain('le texte que le lecteur séparé ne doit pas recevoir');
    });

    it('une lecture de blocages IMPOSSIBLE tait l’audience — fermé, jamais ouvert', async () => {
      const emissions = await diffuser('panne', diffusion);
      expect(recuDansLaRoomDuPost(emissions)).toHaveLength(0);
    });

    it('… mais l’AUTEUR reçoit TOUJOURS son propre contenu', async () => {
      for (const blocages of [{ [LECTEUR]: [AUTEUR] }, { [AUTEUR]: [LECTEUR] }, 'panne' as const]) {
        resetSeparationCacheForTests();
        const emissions = await diffuser(blocages, diffusion);
        expect(recuParLAuteur(emissions)).toHaveLength(1);
      }
    });
  });

  describe.each(sansRoomDePost)('%s — n’adresse AUCUNE room de post', (_nom, diffusion) => {
    it('ne cite aucune room de post : sa feed room suffit, et elle est déjà filtrée', async () => {
      const emissions = await diffuser({}, diffusion);
      expect(emissions.length).toBeGreaterThan(0);
      for (const e of emissions) expect(e.rooms.some((r) => r.startsWith('post:'))).toBe(false);
    });

    it('un lecteur SÉPARÉ n’est dans aucune de ses feed rooms', async () => {
      const emissions = await diffuser({ [LECTEUR]: [AUTEUR] }, diffusion);
      for (const e of emissions) expect(e.rooms).not.toContain(`feed:${LECTEUR}`);
    });
  });

  describe.each(traductions)('%s — porte `translation.text`, donc du CONTENU', (_nom, diffusion) => {
    it('se tait chez le lecteur que le blocage sépare', async () => {
      const emissions = await diffuser({ [LECTEUR]: [AUTEUR] }, diffusion);
      const servi = JSON.stringify(recuDansLaRoomDuPost(emissions));
      expect(servi).not.toContain('the text a separated reader must not receive');
    });

    it('part bien SANS blocage', async () => {
      const emissions = await diffuser({}, diffusion);
      expect(JSON.stringify(emissions)).toContain('the text a separated reader must not receive');
    });
  });

  it('post:deleted reste LARGE — il ne porte aucun contenu, seulement un id et son auteur', async () => {
    const emissions = await diffuser({ [LECTEUR]: [AUTEUR] }, (h) => h.broadcastPostDeleted(POST_ID, AUTEUR));
    const charges = emissions.map((e) => e.charge);
    expect(charges.length).toBeGreaterThan(0);
    for (const charge of charges) expect(Object.keys(charge).sort()).toEqual(['authorId', 'postId']);
  });
});
