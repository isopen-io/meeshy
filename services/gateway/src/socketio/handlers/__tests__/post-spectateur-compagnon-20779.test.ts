/**
 * **#20779 — UN SPECTATEUR DE LA ROOM D'UN POST, SÉPARÉ D'UN COMPAGNON,
 * REÇOIT SON ÉDITION EN DIRECT — AMPUTÉE DE CE SEUL COMPAGNON.**
 *
 * #20711 a fermé la fuite : une diffusion de publication ne réinjecte plus la
 * source republiée ni l'aperçu des commentaires d'un auteur que le lecteur a
 * bloqué. Elle l'a fermée en EXCLUANT les lecteurs séparés de la charge commune
 * — par `except` sur leur room `user:`, qui porte sur TOUTES les adresses de
 * l'émission, `ROOMS.post(postId)` comprise — puis en servant à chacun la
 * sienne sur sa feed room.
 *
 * **La boucle par lecteur n'itère que `recipients`.** Un spectateur présent
 * dans la room du post SANS être dans l'audience n'y figure pas : il était
 * exclu de la charge commune et n'en recevait aucune autre. Zéro livraison.
 *
 * Qui c'est : quiconque a ouvert le détail d'un post, le reel viewer, la
 * feuille de commentaires ou le lecteur de story d'un post PUBLIC d'un inconnu
 * (`post:join` est gaté par visibilité côté serveur), ET a bloqué un des trois
 * commentateurs de son aperçu ou l'auteur de sa source republiée.
 *
 * ─── CE QUE CES TÉMOINS N'ASSERTENT PAS ──────────────────────────────────
 *
 * Rien sur les lecteurs de l'AUDIENCE : cet axe est celui de #20711, dont les
 * témoins vivent dans `post-compagnons-separes-20711.test.ts`. Ici le
 * spectateur n'est PAS ami de l'auteur, et c'est la propriété même qu'on garde
 * — un témoin dont le spectateur serait aussi dans l'audience passerait par la
 * boucle de #20711 et ne pourrait pas tomber.
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

const AUTEUR = 'auteur-C-20779';
/** Ami de l'auteur : il est dans l'audience, donc servi par la boucle de #20711. */
const AMI = 'ami-A-20779';
/** NON ami : il n'est dans AUCUNE audience, seulement dans la room du post. */
const SPECTATEUR = 'spectateur-S-20779';
/** Un SECOND spectateur, séparé d'un AUTRE compagnon — sans lui, « chacun sa
 *  charge » et « la charge amputée de TOUS les compagnons » rendent le même
 *  verdict, et le témoin de précision ne peut pas tomber (leçon de #20711). */
const SPECTATEUR_2 = 'spectateur-T-20779';
const COMPAGNON = 'compagnon-B-20779';
const AUTRE_COMPAGNON = 'compagnon-D-20779';
const POST_ID = '507f191e810c19729de20779';

const TEXTE_POST = 'le texte de C, que tout spectateur a le droit de lire';
const TEXTE_COMMENTE = 'le commentaire de B que S ne doit pas recevoir';
const TEXTE_AUTRE = 'le commentaire de D que T ne doit pas recevoir';
const TEXTE_REPUBLIE = 'la source republiée de B que S ne doit pas recevoir';

type Emission = { evenement: string; rooms: string[]; exclues: string[]; charge: any };
type Blocages = Readonly<Record<string, readonly string[]>>;

/**
 * **La panne est CIBLÉE sur l'axe de l'AUTEUR, et c'est la leçon de #20711.**
 *
 * Faire lever TOUTE lecture de blocage ferait aussi tomber le pré-filtre des
 * feed rooms, dont le `catch` ne rend que l'auteur : le défaut se déplacerait
 * hors de l'audience, où plus aucune assertion ne peut le voir (constat C9 de
 * #20430, qui a déjà frappé deux fois). On ne fait donc lever que les deux
 * requêtes dont les SUJETS sont exactement `[AUTEUR]` — celles de
 * `contentSeparation`, et elles seules.
 */
const estLAxeDeLAuteur = (args: any): boolean => {
  const hasSome: string[] | undefined = args?.where?.blockedUserIds?.hasSome;
  if (hasSome) return hasSome.length === 1 && hasSome[0] === AUTEUR;
  if (args?.where?.blockedUserIds?.has) return false;
  const ids: string[] | undefined = args?.where?.id?.in;
  return Array.isArray(ids) && ids.length === 1 && ids[0] === AUTEUR;
};

/** Qui se tient dans la room du post : un socket, et les rooms qu'il a rejointes. */
type Spectateur = { readonly id: string; readonly userId: string };

function fauxPrisma(blocages: Blocages, panneAxeAuteur = false) {
  return {
    user: {
      findMany: jest.fn(async (args: any) => {
        if (panneAxeAuteur && estLAxeDeLAuteur(args)) throw new Error('mongo indisponible');
        if (args?.where?.blockedUserIds?.hasSome) {
          const sujets: string[] = args.where.blockedUserIds.hasSome;
          return Object.entries(blocages)
            .filter(([, cibles]) => cibles.some((c) => sujets.includes(c)))
            .map(([b, cibles]) => ({ id: b, blockedUserIds: [...cibles] }));
        }
        if (args?.where?.blockedUserIds?.has) {
          const cible: string = args.where.blockedUserIds.has;
          const candidats: string[] = args?.where?.id?.in ?? [];
          return candidats.filter((id) => (blocages[id] ?? []).includes(cible)).map((id) => ({ id }));
        }
        const ids: string[] = args?.where?.id?.in ?? [];
        return ids.map((id) => ({ id, blockedUserIds: [...(blocages[id] ?? [])] }));
      }),
      findUnique: jest.fn(async (args: any) => {
        if (panneAxeAuteur && args?.where?.id === AUTEUR) throw new Error('mongo indisponible');
        return { blockedUserIds: [...(blocages[args?.where?.id] ?? [])] };
      }),
    },
    userRelation: { findMany: jest.fn(async () => []) },
    friendRequest: {
      findMany: jest.fn(async () => [
        { senderId: AUTEUR, receiverId: AMI, status: 'accepted', updatedAt: new Date('2026-11-28T00:00:00Z') },
      ]),
    },
  } as unknown as PrismaClient;
}

/**
 * Le double d'`io` porte DEUX surfaces, et c'est la deuxième que ce lot ajoute :
 * `to`/`except`/`emit` (l'adressage par room) et `in(room).fetchSockets()`
 * (l'ÉNUMÉRATION de la room du post, seule adresse non énumérable autrement).
 *
 * Chaque spectateur porte sa room `user:` ET sa feed room, comme en production
 * (`feed:subscribe` joint la sienne) : c'est ce qui rend observable le fait que
 * la charge part à la SOCKET et non à la feed room.
 */
function fauxIo(emissions: Emission[], spectateurs: readonly Spectateur[], panneFetch = false) {
  const fetchSockets = jest.fn(async () => {
    if (panneFetch) throw new Error('timeout reached while waiting for fetchSockets response');
    return spectateurs.map((s) => ({
      id: s.id,
      rooms: new Set([s.id, `user:${s.userId}`, `feed:${s.userId}`, `post:${POST_ID}`]),
    }));
  });
  const operateur = (rooms: string[], exclues: string[]): any => ({
    to: (r: string | string[]) => operateur([...rooms, ...[r].flat()], exclues),
    except: (r: string | string[]) => operateur(rooms, [...exclues, ...[r].flat()]),
    emit: (evenement: string, data: unknown) => {
      emissions.push({ evenement, rooms, exclues, charge: JSON.parse(JSON.stringify(data)) });
      return true;
    },
  });
  return {
    io: { to: (r: string | string[]) => operateur([r].flat(), []), in: () => ({ fetchSockets }) },
    fetchSockets,
  };
}

const avecCommentaires = () => ({
  id: POST_ID,
  authorId: AUTEUR,
  type: 'POST',
  content: TEXTE_POST,
  visibility: 'PUBLIC',
  visibilityUserIds: [],
  communityId: null,
  mediaItems: [],
  comments: [
    { id: 'c-de-B', author: { id: COMPAGNON, username: 'b' }, content: TEXTE_COMMENTE },
    { id: 'c-de-D', author: { id: AUTRE_COMPAGNON, username: 'd' }, content: TEXTE_AUTRE },
  ],
} as any);

const avecRepost = () => ({
  id: POST_ID,
  authorId: AUTEUR,
  type: 'POST',
  content: TEXTE_POST,
  visibility: 'PUBLIC',
  visibilityUserIds: [],
  communityId: null,
  mediaItems: [],
  repostOf: { id: 'post-de-B', authorId: COMPAGNON, author: { id: COMPAGNON, username: 'b' }, content: TEXTE_REPUBLIE },
} as any);

async function diffuser(
  blocages: Blocages,
  spectateurs: readonly Spectateur[],
  post: any,
  options: { panneFetch?: boolean; panneAxeAuteur?: boolean } = {},
) {
  const emissions: Emission[] = [];
  const { io, fetchSockets } = fauxIo(emissions, spectateurs, options.panneFetch ?? false);
  const handler = new SocialEventsHandler({
    io: io as any,
    prisma: fauxPrisma(blocages, options.panneAxeAuteur ?? false),
  });
  await handler.broadcastPostUpdated(post, AUTEUR);
  return { emissions, fetchSockets };
}

/**
 * Ce qu'un SOCKET reçoit vraiment : les émissions dont l'adresse l'atteint
 * (sa socket, sa room `user:`, sa feed room, ou la room du post), moins celles
 * qui l'excluent par `except` — lequel porte sur sa room `user:`.
 */
const recuPar = (emissions: Emission[], s: Spectateur) =>
  emissions.filter(
    (e) =>
      (e.rooms.includes(s.id) ||
        e.rooms.includes(`user:${s.userId}`) ||
        e.rooms.includes(`feed:${s.userId}`) ||
        e.rooms.includes(`post:${POST_ID}`)) &&
      !e.exclues.includes(`user:${s.userId}`),
  );

const texteRecuPar = (emissions: Emission[], s: Spectateur) => JSON.stringify(recuPar(emissions, s));

const SOCKET_S: Spectateur = { id: 'socket-de-S', userId: SPECTATEUR };
const SOCKET_T: Spectateur = { id: 'socket-de-T', userId: SPECTATEUR_2 };
const SOCKET_AMI: Spectateur = { id: 'socket-de-A', userId: AMI };

beforeEach(() => {
  resetSeparationCacheForTests();
  jest.clearAllMocks();
});

describe('#20779 — le spectateur hors audience, séparé d’un compagnon', () => {
  it('SANS blocage, il reçoit la charge commune, aperçu compris (non-régression)', async () => {
    const { emissions } = await diffuser({}, [SOCKET_S], avecCommentaires());
    expect(recuPar(emissions, SOCKET_S).length).toBeGreaterThan(0);
    expect(texteRecuPar(emissions, SOCKET_S)).toContain(TEXTE_COMMENTE);
  });

  it('séparé d’un COMMENTATEUR, il reçoit quand même l’édition', async () => {
    const { emissions } = await diffuser({ [SPECTATEUR]: [COMPAGNON] }, [SOCKET_S], avecCommentaires());
    expect(recuPar(emissions, SOCKET_S).length).toBeGreaterThan(0);
    expect(texteRecuPar(emissions, SOCKET_S)).toContain(TEXTE_POST);
  });

  it('séparé d’un COMMENTATEUR, le commentaire de ce seul compagnon ne lui part pas', async () => {
    const { emissions } = await diffuser({ [SPECTATEUR]: [COMPAGNON] }, [SOCKET_S], avecCommentaires());
    expect(texteRecuPar(emissions, SOCKET_S)).not.toContain(TEXTE_COMMENTE);
  });

  it('… et il garde l’aperçu de l’autre commentateur (précision, pas amputation en bloc)', async () => {
    const { emissions } = await diffuser({ [SPECTATEUR]: [COMPAGNON] }, [SOCKET_S], avecCommentaires());
    expect(texteRecuPar(emissions, SOCKET_S)).toContain(TEXTE_AUTRE);
  });

  it('deux spectateurs séparés de compagnons DIFFÉRENTS reçoivent deux charges différentes', async () => {
    const { emissions } = await diffuser(
      { [SPECTATEUR]: [COMPAGNON], [SPECTATEUR_2]: [AUTRE_COMPAGNON] },
      [SOCKET_S, SOCKET_T],
      avecCommentaires(),
    );
    expect(texteRecuPar(emissions, SOCKET_S)).not.toContain(TEXTE_COMMENTE);
    expect(texteRecuPar(emissions, SOCKET_S)).toContain(TEXTE_AUTRE);
    expect(texteRecuPar(emissions, SOCKET_T)).not.toContain(TEXTE_AUTRE);
    expect(texteRecuPar(emissions, SOCKET_T)).toContain(TEXTE_COMMENTE);
  });

  it('séparé de l’auteur REPUBLIÉ, la source ne lui part pas, et `repostOf` sort à `null`', async () => {
    const { emissions } = await diffuser({ [SPECTATEUR]: [COMPAGNON] }, [SOCKET_S], avecRepost());
    const recu = recuPar(emissions, SOCKET_S);
    expect(recu.length).toBeGreaterThan(0);
    expect(JSON.stringify(recu)).not.toContain(TEXTE_REPUBLIE);
    for (const e of recu) {
      expect('repostOf' in e.charge.post).toBe(true);
      expect(e.charge.post.repostOf).toBeNull();
    }
  });

  it('la charge d’un spectateur ne porte AUCUNE liste d’audience', async () => {
    const { emissions } = await diffuser({ [SPECTATEUR]: [COMPAGNON] }, [SOCKET_S], avecCommentaires());
    for (const e of recuPar(emissions, SOCKET_S)) {
      expect(e.charge.post.audienceUserIds).toBeUndefined();
      expect(e.charge.post.visibilityUserIds).toBeUndefined();
    }
  });

  it('elle part à sa SOCKET, jamais à sa feed room — qui atteindrait un non-spectateur', async () => {
    const { emissions } = await diffuser({ [SPECTATEUR]: [COMPAGNON] }, [SOCKET_S], avecCommentaires());
    const siennes = emissions.filter((e) => e.rooms.includes(SOCKET_S.id));
    expect(siennes.length).toBe(1);
    expect(emissions.some((e) => e.rooms.includes(`feed:${SPECTATEUR}`))).toBe(false);
  });

  it('séparé de l’AUTEUR du post, il ne reçoit RIEN — la forme 1 n’ouvre pas cette porte', async () => {
    const { emissions } = await diffuser({ [SPECTATEUR]: [AUTEUR] }, [SOCKET_S], avecCommentaires());
    expect(recuPar(emissions, SOCKET_S)).toEqual([]);
  });

  it('séparé de l’AUTEUR **et** d’un compagnon, il ne reçoit toujours RIEN', async () => {
    const { emissions } = await diffuser({ [SPECTATEUR]: [AUTEUR, COMPAGNON] }, [SOCKET_S], avecCommentaires());
    expect(recuPar(emissions, SOCKET_S)).toEqual([]);
  });

  it('un lecteur de l’AUDIENCE présent dans la room n’est pas servi DEUX fois', async () => {
    const { emissions } = await diffuser({ [AMI]: [COMPAGNON] }, [SOCKET_AMI], avecCommentaires());
    expect(emissions.some((e) => e.rooms.includes(SOCKET_AMI.id))).toBe(false);
    expect(recuPar(emissions, SOCKET_AMI).length).toBe(1);
    expect(texteRecuPar(emissions, SOCKET_AMI)).not.toContain(TEXTE_COMMENTE);
  });

  it('la room n’est PAS énumérée quand personne n’est séparé d’un compagnon (coût nul)', async () => {
    const { fetchSockets } = await diffuser({}, [SOCKET_S], avecCommentaires());
    expect(fetchSockets).not.toHaveBeenCalled();
  });

  it('la room n’est PAS énumérée quand le post ne porte aucun compagnon', async () => {
    const nu = { ...avecCommentaires(), comments: [], repostOf: null };
    const { fetchSockets } = await diffuser({ [SPECTATEUR]: [COMPAGNON] }, [SOCKET_S], nu);
    expect(fetchSockets).not.toHaveBeenCalled();
  });

  it('une énumération qui ÉCHOUE retombe sur l’état d’avant : rien pour lui, et rien ne fuit', async () => {
    const { emissions } = await diffuser({ [SPECTATEUR]: [COMPAGNON] }, [SOCKET_S], avecCommentaires(), {
      panneFetch: true,
    });
    expect(recuPar(emissions, SOCKET_S)).toEqual([]);
    expect(JSON.stringify(emissions)).toContain(TEXTE_COMMENTE);
  });

  it('un spectateur que RIEN ne sépare garde sa charge commune quand un AUTRE est séparé', async () => {
    const { emissions } = await diffuser({ [SPECTATEUR]: [COMPAGNON] }, [SOCKET_S, SOCKET_T], avecCommentaires());
    expect(texteRecuPar(emissions, SOCKET_T)).toContain(TEXTE_COMMENTE);
    expect(texteRecuPar(emissions, SOCKET_T)).toContain(TEXTE_AUTRE);
  });

  /**
   * **Ce témoin manquait, et c'est une mutation qui l'a dit.** « Rendre TOUS
   * les sockets de la room, sans filtrer sur la séparation » laissait les
   * quinze autres VERTS : le spectateur que rien ne sépare recevait alors la
   * charge commune ET une charge à sa socket — DEUX `post:updated` pour une
   * édition. Aucune assertion `toContain` ne peut voir un doublon ; seul un
   * COMPTE le voit. Même famille que le `+2` de réaction que
   * `emitToUserFeedAndPostRoom` existe pour empêcher.
   */
  it('… et il ne la reçoit qu’UNE fois — aucun doublon à sa socket', async () => {
    const { emissions } = await diffuser({ [SPECTATEUR]: [COMPAGNON] }, [SOCKET_S, SOCKET_T], avecCommentaires());
    expect(recuPar(emissions, SOCKET_T).length).toBe(1);
    expect(emissions.some((e) => e.rooms.includes(SOCKET_T.id))).toBe(false);
  });

  /**
   * **Ce témoin manquait aussi, et c'est encore une mutation qui l'a dit.**
   * Retirer `postRoom.separated === null` de la condition d'appel laissait les
   * seize autres VERTS — et cette mutation-là est un FAIL-OPEN : quand l'axe de
   * l'AUTEUR n'a pas pu être lu, #20430 n'adresse pas la room du post, faute de
   * savoir qui l'auteur a bloqué. Énumérer la room malgré tout servirait le
   * post à un lecteur dont on ne sait RIEN — sur la foi d'une panne.
   */
  it('quand l’axe de l’AUTEUR est ILLISIBLE, le spectateur ne reçoit RIEN', async () => {
    const { emissions, fetchSockets } = await diffuser(
      { [SPECTATEUR]: [COMPAGNON] },
      [SOCKET_S],
      avecCommentaires(),
      { panneAxeAuteur: true },
    );
    expect(recuPar(emissions, SOCKET_S)).toEqual([]);
    expect(fetchSockets).not.toHaveBeenCalled();
  });

  it('un spectateur séparé ne reçoit lui aussi qu’UNE charge', async () => {
    const { emissions } = await diffuser({ [SPECTATEUR]: [COMPAGNON] }, [SOCKET_S], avecCommentaires());
    expect(recuPar(emissions, SOCKET_S).length).toBe(1);
  });
});
