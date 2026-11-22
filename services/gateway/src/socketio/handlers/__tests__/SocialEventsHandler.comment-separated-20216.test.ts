/**
 * #20216 — un commentaire d'un auteur qu'un blocage sépare d'un lecteur
 * n'arrive pas EN DIRECT chez ce lecteur. La liste REST le tait depuis #20205 ;
 * la diffusion `comment:*` atteignait encore la room du post, où le lecteur qui
 * a bloqué l'auteur garde le détail ouvert. Les rooms `user:<id>` de chaque
 * compte séparé du commentateur sont EXCLUES de l'émission (les deux sens
 * confondus), et une lecture des blocages qui échoue n'émet rien.
 *
 * Le couple (événement, charge) est relevé tel qu'il part sur le fil.
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

const AUTEUR_POST = 'auteur-post-20216';
const COMMENTATEUR = 'commentateur-20216';
const LECTEUR_QUI_A_BLOQUE = 'lecteur-bloqueur-20216';
const BLOQUE_PAR_COMMENTATEUR = 'bloque-20216';
const POST_ID = '507f191e810c19729de20216';

type Emission = { evenement: string; rooms: string[]; exclues: string[]; charge: any };

type Blocages = { readonly bloquentLeCommentateur: string[]; readonly bloquesParLeCommentateur: string[] } | 'panne';

function monter(blocages: Blocages) {
  const emissions: Emission[] = [];
  const operateur = (rooms: string[], exclues: string[]): any => ({
    to: (r: string | string[]) => operateur([...rooms, ...[r].flat()], exclues),
    except: (r: string | string[]) => operateur(rooms, [...exclues, ...[r].flat()]),
    emit: (evenement: string, data: unknown) => {
      emissions.push({ evenement, rooms, exclues, charge: JSON.parse(JSON.stringify(data)) });
      return true;
    },
  });
  /* Les DEUX sens se lisent par `user.findMany` depuis #20236 — « qui a bloqué
     l'un de ces sujets ? » (`blockedUserIds.hasSome`) puis « qui ces sujets
     ont-ils bloqué ? » (`id: { in }`) : deux lectures quel que soit le nombre
     de sujets, là où une lecture par sujet les multipliait. Le double suit la
     production ; un double resté sur `findUnique` témoignerait d'un monde qui
     n'existe plus. */
  const lireBlocages = jest.fn(async (args: any) => {
    if (blocages === 'panne') throw new Error('mongo indisponible');
    if (args?.where?.blockedUserIds?.hasSome) return blocages.bloquentLeCommentateur.map((id) => ({ id }));
    return (args?.where?.id?.in ?? []).map(() => ({ blockedUserIds: blocages.bloquesParLeCommentateur }));
  });
  const prisma = {
    friendRequest: { findMany: jest.fn(async () => []) },
    userRelation: { findUnique: jest.fn(async () => null), findMany: jest.fn(async () => []) },
    user: {
      findMany: lireBlocages,
      findUnique: jest.fn(async () => null),
      findFirst: jest.fn(async () => null),
    },
  } as unknown as PrismaClient;
  const io: any = { to: (r: string | string[]) => operateur([r].flat(), []) };
  return { handler: new SocialEventsHandler({ io, prisma }), emissions, prisma };
}

// La forme que les producteurs SÉLECTIONNENT (`CREATED_COMMENT_SELECT`) : l'auteur
// voyage sous `author`, jamais en `authorId` à plat. Une fabrique qui posait
// `authorId` rendait ce témoin vert sur une diffusion qui, en production, ne
// filtrait personne (revue adversariale du lot).
const commentaire = (): any => ({
  id: 'c-20216',
  postId: POST_ID,
  content: 'bonjour',
  author: { id: COMMENTATEUR, username: 'commentateur', displayName: 'Commentateur', avatar: null },
});

const traduction = { text: 'hello', translationModel: 'nllb', createdAt: '2026-11-21T00:00:00.000Z' };

const diffusions: ReadonlyArray<readonly [string, (h: SocialEventsHandler) => Promise<void>]> = [
  ['comment:added', (h) => h.broadcastCommentAdded({ postId: POST_ID, comment: commentaire(), commentCount: 1 }, AUTEUR_POST, 'PUBLIC', [])],
  ['comment:updated', (h) => h.broadcastCommentUpdated({ postId: POST_ID, comment: commentaire() }, AUTEUR_POST, 'PUBLIC', [])],
  ['comment:media-updated', (h) => h.broadcastCommentMediaUpdated({ postId: POST_ID, commentId: 'c-20216', comment: commentaire() }, AUTEUR_POST, 'PUBLIC', [])],
  [
    'comment:translation-updated',
    (h) =>
      h.broadcastCommentTranslationUpdated(
        { postId: POST_ID, commentId: 'c-20216', language: 'en', translation: traduction },
        AUTEUR_POST,
        'PUBLIC',
        [],
        COMMENTATEUR,
      ),
  ],
  [
    'media:caption-translation-updated',
    (h) => h.broadcastMediaCaptionTranslationUpdated({ mediaId: 'm-20216', postId: POST_ID, commentId: 'c-20216', language: 'en', translation: traduction } as never, AUTEUR_POST, 'PUBLIC', [], COMMENTATEUR),
  ],
  [
    'media:alt-translation-updated',
    (h) => h.broadcastMediaAltTranslationUpdated({ mediaId: 'm-20216', postId: POST_ID, commentId: 'c-20216', language: 'en', translation: traduction } as never, AUTEUR_POST, 'PUBLIC', [], COMMENTATEUR),
  ],
];

describe('#20216 — la diffusion d’un commentaire tait l’auteur séparé du lecteur', () => {
  /* La séparation se garde dans un cache PARTAGÉ par le processus depuis
     #20236 — une seule chose à invalider quand un blocage bouge. Chaque témoin
     repart donc d'une ardoise vide, sans quoi il lirait la réponse du
     précédent (mesuré : les vecteurs « aucun blocage » passaient au rouge). */
  beforeEach(() => resetSeparationCacheForTests());

  it.each(diffusions)('%s exclut la room personnelle de chaque compte séparé du commentateur, dans les deux sens', async (evenement, diffuser) => {
    const { handler, emissions } = monter({
      bloquentLeCommentateur: [LECTEUR_QUI_A_BLOQUE],
      bloquesParLeCommentateur: [BLOQUE_PAR_COMMENTATEUR],
    });

    await diffuser(handler);

    expect(emissions).toHaveLength(1);
    expect(emissions[0].evenement).toBe(evenement);
    expect(emissions[0].rooms).toContain(`post:${POST_ID}`);
    expect([...emissions[0].exclues].sort()).toEqual([`user:${BLOQUE_PAR_COMMENTATEUR}`, `user:${LECTEUR_QUI_A_BLOQUE}`]);
  });

  it.each(diffusions)('%s n’exclut personne quand aucun blocage ne touche le commentateur', async (evenement, diffuser) => {
    const { handler, emissions } = monter({ bloquentLeCommentateur: [], bloquesParLeCommentateur: [] });

    await diffuser(handler);

    expect(emissions).toHaveLength(1);
    expect(emissions[0].evenement).toBe(evenement);
    expect(emissions[0].exclues).toEqual([]);
  });

  it.each(diffusions)('%s n’émet rien quand la lecture des blocages échoue (fermé)', async (_evenement, diffuser) => {
    const { handler, emissions } = monter('panne');

    await diffuser(handler);

    expect(emissions).toEqual([]);
  });

  it('comment:added sert le commentaire entier à qui reste dans l’audience', async () => {
    const { handler, emissions } = monter({ bloquentLeCommentateur: [LECTEUR_QUI_A_BLOQUE], bloquesParLeCommentateur: [] });

    await handler.broadcastCommentAdded({ postId: POST_ID, comment: commentaire(), commentCount: 3 }, AUTEUR_POST, 'PUBLIC', []);

    expect(emissions[0].charge).toMatchObject({ postId: POST_ID, commentCount: 3, comment: { id: 'c-20216', author: { id: COMMENTATEUR }, content: 'bonjour' } });
  });
});
