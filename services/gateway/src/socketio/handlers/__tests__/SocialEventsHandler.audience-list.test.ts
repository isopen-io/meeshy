/**
 * #7407 — la diffusion d'une publication restreinte ne transporte la liste
 * d'AUDIENCE (`visibilityUserIds`) que vers la salle de son AUTEUR.
 *
 * `SocialEventsHandler` a BESOIN de la liste : c'est elle qui décide à quelles
 * salles pousser une publication `ONLY`/`EXCEPT`. La charge utile, elle, part
 * vers les salles des amis (et, pour une mise à jour, vers la salle de la
 * publication, où se tient n'importe quel spectateur) : la liste y apprenait à
 * chaque ami non exclu QUI l'auteur a écarté. L'auteur, lui, la garde — ses
 * autres appareils la persistent depuis cet écho (iOS `FeedSocketHandler`), et
 * son formulaire d'édition la relit.
 *
 * Le témoin juge ce que CHAQUE SOCKET reçoit, pas ce que les salles désignent :
 * un socket se tient dans plusieurs salles (l'auteur qui regarde sa propre
 * publication est dans sa salle de fil ET dans la salle de la publication), et
 * il doit recevoir l'événement EXACTEMENT une fois, sous la forme qui lui
 * revient. La charge est relue SÉRIALISÉE (`JSON`), comme elle part sur le fil.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { SocialEventsHandler } from '../SocialEventsHandler';

jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: { child: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }) },
}));

const AUTEUR = 'auteur-7407';
const AMI = 'ami-7407';
const EXCLU = 'exclu-7407';
const SPECTATEUR = 'spectateur-7407';
const POST_ID = '507f191e810c19729de87407';

type Emission = { readonly salles: readonly string[]; readonly sauf: readonly string[]; readonly evenement: string; readonly charge: Record<string, any> };

function fauxIo() {
  const emissions: Emission[] = [];
  const liste = (r: string | readonly string[]) => (Array.isArray(r) ? [...r] : [r as string]);
  const operateur = (salles: readonly string[], sauf: readonly string[]): any => ({
    to: (r: string | string[]) => operateur([...salles, ...liste(r)], sauf),
    except: (r: string | string[]) => operateur(salles, [...sauf, ...liste(r)]),
    emit: (evenement: string, data: unknown) => {
      emissions.push({ salles, sauf, evenement, charge: JSON.parse(JSON.stringify(data)) });
      return true;
    },
  });
  return { io: { to: (r: string | string[]) => operateur(liste(r), []) }, emissions };
}

/** Ce qu'un socket reçoit, selon les salles où il se tient. */
function recuPar(emissions: readonly Emission[], sallesDuSocket: readonly string[]): Emission[] {
  return emissions.filter((e) =>
    e.salles.some((s) => sallesDuSocket.includes(s)) && !e.sauf.some((s) => sallesDuSocket.includes(s)),
  );
}

function monter() {
  const prisma = {
    friendRequest: {
      findMany: jest.fn(async () => [
        { senderId: AUTEUR, receiverId: AMI },
        { senderId: EXCLU, receiverId: AUTEUR },
      ]),
    },
  } as unknown as PrismaClient;
  const { io, emissions } = fauxIo();
  return { handler: new SocialEventsHandler({ io: io as any, prisma }), emissions };
}

function publicationRestreinte(extra: Record<string, unknown> = {}): any {
  return {
    id: POST_ID,
    authorId: AUTEUR,
    type: 'POST',
    visibility: 'EXCEPT',
    visibilityUserIds: [EXCLU],
    repostOfId: null,
    content: 'Pas pour tout le monde',
    ...extra,
  };
}

const SOCKET_AUTEUR = [`feed:${AUTEUR}`, `post:${POST_ID}`];
const SOCKET_AMI = [`feed:${AMI}`, `post:${POST_ID}`];
const SOCKET_SPECTATEUR = [`post:${POST_ID}`];

const cle = (evenement: string) => (evenement.startsWith('story') ? 'story' : evenement.startsWith('status') ? 'status' : 'post');

describe('#7407 — la diffusion ne transporte la liste d’audience que vers l’auteur', () => {
  const diffusions: ReadonlyArray<readonly [string, string, (h: SocialEventsHandler, p: any) => Promise<void>]> = [
    ['post:created', 'POST', (h, p) => h.broadcastPostCreated(p, AUTEUR)],
    ['post:updated', 'POST', (h, p) => h.broadcastPostUpdated(p, AUTEUR)],
    ['story:created', 'STORY', (h, p) => h.broadcastStoryCreated(p, AUTEUR)],
    ['story:updated', 'STORY', (h, p) => h.broadcastStoryUpdated(p, AUTEUR)],
    ['status:created', 'STATUS', (h, p) => h.broadcastStatusCreated(p, AUTEUR)],
    ['status:updated', 'STATUS', (h, p) => h.broadcastStatusUpdated(p, AUTEUR)],
  ];

  it.each(diffusions)('%s : l’ami non exclu reçoit la publication UNE fois, sans la liste ni l’identifiant exclu', async (evenement, type, diffuser) => {
    const { handler, emissions } = monter();

    await diffuser(handler, publicationRestreinte({ type }));

    const recues = recuPar(emissions, SOCKET_AMI);
    expect(recues.map((e) => e.evenement)).toEqual([evenement]);
    expect(recues[0].charge[cle(evenement)]).not.toHaveProperty('visibilityUserIds');
    expect(JSON.stringify(recues[0].charge)).not.toContain(EXCLU);
  });

  it.each(diffusions)('%s : l’auteur reçoit la publication UNE fois, AVEC sa liste', async (evenement, type, diffuser) => {
    const { handler, emissions } = monter();

    await diffuser(handler, publicationRestreinte({ type }));

    const recues = recuPar(emissions, SOCKET_AUTEUR);
    expect(recues.map((e) => e.evenement)).toEqual([evenement]);
    expect(recues[0].charge[cle(evenement)]).toMatchObject({ visibilityUserIds: [EXCLU] });
  });

  it('post:updated : le spectateur de la salle de la publication reçoit la version sans liste', async () => {
    const { handler, emissions } = monter();

    await handler.broadcastPostUpdated(publicationRestreinte(), AUTEUR);

    const recues = recuPar(emissions, SOCKET_SPECTATEUR);
    expect(recues).toHaveLength(1);
    expect(recues[0].charge.post).not.toHaveProperty('visibilityUserIds');
  });

  it('l’exclu ne reçoit RIEN — la liste continue de router la diffusion', async () => {
    const { handler, emissions } = monter();

    await handler.broadcastPostCreated(publicationRestreinte(), AUTEUR);

    expect(recuPar(emissions, [`feed:${EXCLU}`])).toEqual([]);
  });

  it('post:reposted : une republication hérite la liste de sa source et ne la rend à PERSONNE, son auteur compris', async () => {
    const { handler, emissions } = monter();
    const republication = publicationRestreinte({ repostOfId: '507f191e810c19729de80000' });

    await handler.broadcastPostReposted({ originalPostId: '507f191e810c19729de80000', repost: republication } as any, AUTEUR);

    for (const socket of [SOCKET_AUTEUR, SOCKET_AMI]) {
      const recues = recuPar(emissions, socket);
      expect(recues).toHaveLength(1);
      expect(recues[0].charge.repost).not.toHaveProperty('visibilityUserIds');
    }
    expect(JSON.stringify(emissions.map((e) => e.charge))).not.toContain(EXCLU);
  });
});
