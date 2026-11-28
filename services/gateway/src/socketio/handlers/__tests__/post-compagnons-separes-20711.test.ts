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
import { withMentions } from '../../../services/posts/postReferences';
import { WIRE_BROADCAST } from '../../../services/posts/storyEffectsV3';

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
/** L'auteur d'ORIGINE d'un contenu éphémère recopié : `repostOf.snapshotAuthorId`. */
const ORIGINE = 'origine-O-20711';
const POST_ID = '507f191e810c19729de20711';

const TEXTE_REPUBLIE = 'le texte republié de B que A ne doit pas recevoir';
const TEXTE_COMMENTE = 'le commentaire de B que A ne doit pas recevoir';
const TEXTE_AUTRE = 'le commentaire de D, que rien ne sépare de A';
const TEXTE_COPIE = 'le contenu COPIÉ de O que A ne doit pas recevoir';

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

/**
 * Une COPIE : la source republiée est d'un auteur que rien ne sépare de A
 * (`COMPAGNON` n'est pas bloqué ici), mais elle porte les médias et le contenu
 * de son auteur d'ORIGINE, nommé par `snapshotAuthorId` — et c'est lui que le
 * blocage sépare.
 */
const avecCopie = (type: string) => ({
  id: POST_ID,
  authorId: AUTEUR,
  type,
  content: 'le texte de C, parfaitement lisible par A',
  visibility: 'PUBLIC',
  visibilityUserIds: [],
  communityId: null,
  mediaItems: [],
  repostOf: {
    id: 'post-relaye',
    authorId: AUTRE_COMPAGNON,
    author: { id: AUTRE_COMPAGNON, username: 'd' },
    snapshotAuthorId: ORIGINE,
    content: TEXTE_COPIE,
  },
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

  /**
   * **LA FIXTURE TRAVERSE LA CHAÎNE DE SERVICE, ET C'EST TOUT L'INTÉRÊT**
   * (audit adversarial du lot, constat F1).
   *
   * Les témoins ci-dessus construisent leur post À LA MAIN et le passent au
   * handler. Les cinq producteurs réels, eux, composent leur charge par
   * `withMentions(ligne, WIRE_BROADCAST)` AVANT de la diffuser — et cette
   * composition retirait `repostOf.snapshotAuthorId`, la colonne de DÉCISION
   * dont la moitié « copie d'un contenu éphémère » de la loi dépend. La loi
   * était donc **morte sur tous les chemins de production**, et aucun témoin à
   * fixture manuelle ne pouvait le voir : mutée, la ligne qui la porte laissait
   * 881 témoins verts.
   *
   * > **Un témoin dont la fixture ne traverse pas la composition de production
   * > atteste une loi qui s'applique à une forme que personne n'émet.** La
   * > question à poser à toute fixture de diffusion n'est pas « porte-t-elle
   * > les bons champs ? » mais **« par où le producteur réel la fait-il
   * > passer avant d'émettre ? »**.
   */
  describe('la COPIE d’un contenu éphémère, composée comme en production', () => {
    const compose = (type: string) => withMentions(avecCopie(type), WIRE_BROADCAST) as any;

    it('la chaîne de service garde la colonne de décision jusqu’à la résolution', () => {
      expect(compose('POST').repostOf.snapshotAuthorId).toBe(ORIGINE);
    });

    it('SANS blocage, le contenu copié arrive', async () => {
      const emissions = await diffuser({}, (h) => h.broadcastPostUpdated(compose('POST'), AUTEUR));
      expect(texteRecuParLeLecteur(emissions)).toContain(TEXTE_COPIE);
    });

    it('quand A a bloqué l’auteur d’ORIGINE, la copie ne lui part plus', async () => {
      const emissions = await diffuser({ [LECTEUR]: [ORIGINE] }, (h) =>
        h.broadcastPostUpdated(compose('POST'), AUTEUR)
      );
      expect(texteRecuParLeLecteur(emissions)).not.toContain(TEXTE_COPIE);
    });

    it('quand l’auteur d’ORIGINE a bloqué A, la copie ne lui part plus', async () => {
      const emissions = await diffuser({ [ORIGINE]: [LECTEUR] }, (h) =>
        h.broadcastPostUpdated(compose('POST'), AUTEUR)
      );
      expect(texteRecuParLeLecteur(emissions)).not.toContain(TEXTE_COPIE);
    });

    it('la colonne de DÉCISION ne sort sur AUCUNE charge servie — ni commune, ni réduite, ni l’écho de l’auteur', async () => {
      for (const blocages of [{}, { [LECTEUR]: [ORIGINE] }]) {
        resetSeparationCacheForTests();
        const emissions = await diffuser(blocages, (h) => h.broadcastPostUpdated(compose('POST'), AUTEUR));
        expect(emissions.length).toBeGreaterThan(0);
        expect(JSON.stringify(emissions)).not.toContain('snapshotAuthorId');
      }
    });
  });

  /**
   * L'AUTEUR est un lecteur lui aussi : il a pu bloquer un commentateur de son
   * PROPRE post, et le REST le lui retire déjà. Sans ce témoin, la ligne qui
   * réduit son écho n'est gardée par rien (constat F4 de l'audit : mutée, 881
   * témoins restaient verts).
   */
  describe('l’écho de l’AUTEUR suit la même loi', () => {
    const sien = (emissions: Emission[]) => emissions.filter((e) => e.rooms.includes(`feed:${AUTEUR}`));

    it('un commentateur que l’auteur a bloqué sort de SON aperçu aussi', async () => {
      const emissions = await diffuser({ [AUTEUR]: [COMPAGNON] }, (h) =>
        h.broadcastPostUpdated(avecCommentaires('POST'), AUTEUR)
      );
      expect(sien(emissions)).toHaveLength(1);
      expect(JSON.stringify(sien(emissions))).not.toContain(TEXTE_COMMENTE);
      expect(JSON.stringify(sien(emissions))).toContain(TEXTE_AUTRE);
    });

    it('une source republiée que l’auteur a bloquée sort de SON écho aussi', async () => {
      const emissions = await diffuser({ [AUTEUR]: [COMPAGNON] }, (h) =>
        h.broadcastPostUpdated(avecRepost('POST'), AUTEUR)
      );
      expect(JSON.stringify(sien(emissions))).not.toContain(TEXTE_REPUBLIE);
    });
  });

  /**
   * DEUX couches ferment la charge commune au lecteur séparé — son retrait des
   * `audienceRooms`, et l'`except` sur sa room `user:`. Elles sont
   * mutuellement redondantes, donc aucune n'était gardée SEULE (constat F7 de
   * l'audit : chaque mutation isolée laissait 881 verts, les deux ensemble en
   * faisaient tomber 30). Une défense en profondeur dont aucune couche n'est
   * tenue perd une couche en silence.
   */
  describe('les DEUX couches qui ferment la charge commune', () => {
    const chargeCommune = (emissions: Emission[]) =>
      emissions.filter((e) => !e.rooms.includes(`feed:${AUTEUR}`) && JSON.stringify(e.charge).includes(TEXTE_COMMENTE));

    it('couche 1 — la feed room du lecteur séparé n’est PAS dans l’adresse de la charge commune', async () => {
      const emissions = await diffuser({ [LECTEUR]: [COMPAGNON] }, (h) =>
        h.broadcastPostUpdated(avecCommentaires('POST'), AUTEUR)
      );
      for (const e of chargeCommune(emissions)) expect(e.rooms).not.toContain(`feed:${LECTEUR}`);
    });

    it('couche 2 — sa room `user:` est exclue de la charge commune (branche de la room du post)', async () => {
      const emissions = await diffuser({ [LECTEUR]: [COMPAGNON] }, (h) =>
        h.broadcastPostUpdated(avecCommentaires('POST'), AUTEUR)
      );
      const commune = chargeCommune(emissions);
      expect(commune.length).toBeGreaterThan(0);
      for (const e of commune) expect(e.exclues).toContain(`user:${LECTEUR}`);
    });

    /**
     * **LA SECONDE BRANCHE A SA PROPRE COUCHE 2, et le témoin ci-dessus ne la
     * voit pas.** `emitPostToAudience` a DEUX formes d'émission : une seule sur
     * l'union quand la room du post est adressée (`post:updated`), une par feed
     * room sinon (les six autres familles). Le témoin ci-dessus passe par
     * `broadcastPostUpdated`, donc par la PREMIÈRE — retirer l'exclusion de la
     * seconde laissait 103 témoins verts.
     *
     * > **Deux branches d'un même seam sont deux sites, même quand elles portent
     * > la même règle.** Un témoin posé sur la branche la plus intéressante
     * > n'atteste rien de l'autre, et c'est la forme du cycle 127 (« une garde
     * > qui protège la population la plus NOMBREUSE peut manquer la plus
     * > EXPOSÉE ») appliquée à un `if`.
     */
    it('couche 2 — la branche SANS room de post porte l’exclusion elle aussi', async () => {
      const emissions = await diffuser({ [LECTEUR]: [COMPAGNON] }, (h) =>
        h.broadcastStatusUpdated({ ...avecCommentaires('STATUS') }, AUTEUR)
      );
      const commune = emissions.filter(
        (e) => !e.rooms.includes(`feed:${AUTEUR}`) && JSON.stringify(e.charge).includes(TEXTE_COMMENTE)
      );
      expect(commune.length).toBeGreaterThan(0);
      for (const e of commune) {
        expect(e.rooms).not.toContain(`post:${POST_ID}`);
        expect(e.exclues).toContain(`user:${LECTEUR}`);
      }
    });
  });

  /**
   * **LES CLÉS DE CE RÉSOLVEUR SONT JETABLES, DONC IL NE DOIT PAS CACHER**
   * (audit adversarial du lot, constat F3).
   *
   * Le témoin de `separatedRooms.pairs-20711.test.ts` prouve que `cached: false`
   * préserve les entrées stables ; il ne prouve PAS que le site de PRODUCTION
   * le passe. Mesuré : rendre le cache à `companionSeparation` laissait les 103
   * témoins verts. Celui-ci vit donc au niveau du HANDLER.
   *
   * > Un témoin qui exerce une OPTION n'atteste pas que l'appelant la pose.
   */
  describe('la diffusion n’évince pas le cache que #20216 garde', () => {
    it('600 publications à compagnons distincts laissent l’entrée stable de `contentSeparation`', async () => {
      const emissions: Emission[] = [];
      const prisma = fauxPrisma({ [LECTEUR]: [COMPAGNON] });
      const handler = new SocialEventsHandler({ io: fauxIo(emissions) as any, prisma });
      const separations = () =>
        (prisma.user.findMany as any).mock.calls.filter((c: any[]) => c[0]?.where?.blockedUserIds?.hasSome !== undefined)
          .length;

      // Amorce : `post:updated` résout `contentSeparation(AUTEUR)`, clé STABLE.
      await handler.broadcastPostUpdated({ ...avecRepost('POST'), repostOf: null, comments: [] }, AUTEUR);
      const apresAmorce = separations();

      for (let i = 0; i < 600; i += 1) {
        await handler.broadcastStatusUpdated(
          {
            ...avecCommentaires('STATUS'),
            comments: [{ id: `c-${i}`, author: { id: `commentateur-${i}`, username: `u${i}` }, content: 'x' }],
          } as any,
          AUTEUR
        );
      }
      const apresLesJetables = separations();

      // L'entrée stable doit être un HIT : zéro lecture de plus.
      await handler.broadcastPostUpdated({ ...avecRepost('POST'), repostOf: null, comments: [] }, AUTEUR);
      expect(separations()).toBe(apresLesJetables);
      expect(apresAmorce).toBeGreaterThan(0);
    });
  });

  /**
   * `case 'ONLY'` rend la liste BRUTE de `visibilityUserIds`, doublons
   * compris : la boucle par lecteur émettait alors une fois par OCCURRENCE,
   * là où l'émission unique d'avant le lot était dédoublonnée par Socket.IO
   * (constat F6 de l'audit).
   */
  describe('un destinataire nommé DEUX fois ne reçoit qu’une charge', () => {
    it('`ONLY` à doublons : une seule émission par lecteur séparé', async () => {
      const post = {
        ...avecCommentaires('POST'),
        visibility: 'ONLY',
        visibilityUserIds: [LECTEUR, LECTEUR],
      };
      const emissions = await diffuser({ [LECTEUR]: [COMPAGNON] }, (h) => h.broadcastPostUpdated(post as any, AUTEUR));
      expect(emissions.filter((e) => e.rooms.includes(`feed:${LECTEUR}`))).toHaveLength(1);
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
