/**
 * #14069 — partager un contenu prévient l'entourage, selon le réglage de chacun :
 *  - le contenu d'un AUTRE : l'entourage B de son auteur (`circleOnMyContentShare`,
 *    défaut Proche) ET l'entourage C du partageur (`circleElsewhereShare`, défaut
 *    Sang) — le plus restrictif gagne ;
 *  - son PROPRE contenu : l'entourage A du partageur (`circlePublicationShare`,
 *    défaut Proche), c'est une de ses publications qu'il remet en avant.
 * Puis l'admission de la publication. Bloqué : jamais. Une fois par (partageur,
 * contenu) : partager dix fois ne prévient pas dix fois.
 *
 * @jest-environment node
 */
import { describe, it, expect, jest } from '@jest/globals';

jest.mock('../../../utils/logger', () => require('../../../__tests__/helpers/notification-service-doubles').makeLoggerModule());
jest.mock('../../../utils/logger-enhanced', () =>
  require('../../../__tests__/helpers/notification-service-doubles').makeLoggerEnhancedModule()
);

import { relayActivityToEntourage, RELAY_BURST } from '../fanout/activity-relay';
import {
  AUTEUR, COMMENTATEUR as PARTAGEUR, SANG, PROCHE, AMI, CO_MEMBRE, SANG_BLOQUE, SANG_DU_COMMENTATEUR, POST, monde, type Link, type World,
} from '../../../__tests__/helpers/circle-world';

const COMMUN_PROCHE = '6000000000000000000000d1';
const COMMUN_AMI = '6000000000000000000000d3';
const LIENS_COMMUNS: readonly Link[] = [
  [AUTEUR, COMMUN_PROCHE, 'CLOSE'],
  [PARTAGEUR, COMMUN_PROCHE, 'BLOOD'],
  [AUTEUR, COMMUN_AMI, 'FRIEND'],
  [PARTAGEUR, COMMUN_AMI, 'BLOOD'],
];

const POST_DE = (authorId: string, over: Record<string, unknown> = {}) =>
  ({ authorId, type: 'POST', visibility: 'PUBLIC', visibilityUserIds: [], content: '', ...over });

const partager = async (world: World = {}, actorId = PARTAGEUR, post = POST_DE(AUTEUR)) => {
  const m = monde({ ...world, extraLinks: [...LIENS_COMMUNS, ...(world.extraLinks ?? [])], post });
  await relayActivityToEntourage(m.deps, { activity: 'share', postId: POST, actorId });
  return { relayed: m.notified('friend_content_share').sort(), m };
};

describe('partage du contenu d’un autre (friend_content_share, #14069)', () => {
  it('défaut : seul qui est Proche+ de l’auteur ET Sang du partageur', async () => {
    expect((await partager()).relayed).toEqual([COMMUN_PROCHE]);
  });

  it('un Ami de l’auteur n’est pas prévenu au défaut ; l’auteur réglé « Ami », si', async () => {
    expect((await partager()).relayed).not.toContain(COMMUN_AMI);
    const { relayed } = await partager({ settings: { [AUTEUR]: { circleOnMyContentShare: 'FRIEND' } } });
    expect(relayed).toEqual([COMMUN_PROCHE, COMMUN_AMI].sort());
  });

  it('« Personne » chez l’auteur ou chez le partageur ⇒ personne', async () => {
    expect((await partager({ settings: { [AUTEUR]: { circleOnMyContentShare: 'NOBODY' } } })).relayed).toEqual([]);
    expect((await partager({ settings: { [PARTAGEUR]: { circleElsewhereShare: 'NOBODY' } } })).relayed).toEqual([]);
  });

  it('un bloqué n’est jamais prévenu', async () => {
    expect((await partager({ blocks: { [AUTEUR]: [SANG_BLOQUE, COMMUN_PROCHE] } })).relayed).toEqual([]);
  });

  it('le Sang d’un seul côté n’est pas prévenu', async () => {
    const { relayed } = await partager();
    expect(relayed).not.toContain(SANG);
    expect(relayed).not.toContain(SANG_DU_COMMENTATEUR);
  });

  it('la charge nomme l’activité et l’auteur du contenu', async () => {
    const { m } = await partager();
    const [params] = m.createNotification.mock.calls[0] as unknown as [Record<string, Record<string, unknown>>];
    expect(params.metadata).toMatchObject({ activity: 'share', postId: POST, contentAuthorName: AUTEUR });
  });
});

describe('partage de son propre contenu (#14069)', () => {
  it('défaut : l’entourage Proche et au-dessus du partageur, jamais un Ami', async () => {
    const { relayed } = await partager({}, AUTEUR);
    expect(relayed).toEqual([SANG, PROCHE, COMMUN_PROCHE].sort());
    expect(relayed).not.toContain(AMI);
  });

  it('réglage « Personne » ⇒ personne ; « Ami » ⇒ l’Ami aussi', async () => {
    expect((await partager({ settings: { [AUTEUR]: { circlePublicationShare: 'NOBODY' } } }, AUTEUR)).relayed).toEqual([]);
    expect((await partager({ settings: { [AUTEUR]: { circlePublicationShare: 'FRIEND' } } }, AUTEUR)).relayed).toContain(AMI);
  });

  it('la charge ne nomme pas d’auteur tiers', async () => {
    const { m } = await partager({}, AUTEUR);
    const [params] = m.createNotification.mock.calls[0] as unknown as [Record<string, Record<string, unknown>>];
    expect(params.metadata.contentAuthorName).toBeUndefined();
  });
});

describe('un partage répété (#14069)', () => {
  it('ne prévient qu’une fois par partageur et contenu', async () => {
    const m = monde({ extraLinks: LIENS_COMMUNS, post: POST_DE(AUTEUR) });
    for (let i = 0; i < 3; i += 1) {
      await relayActivityToEntourage(m.deps, { activity: 'share', postId: POST, actorId: PARTAGEUR });
    }
    expect(m.notified('friend_content_share')).toEqual([COMMUN_PROCHE]);
  });

  it('une réaction puis un partage du même contenu sont deux activités distinctes', async () => {
    const m = monde({ extraLinks: LIENS_COMMUNS, post: POST_DE(AUTEUR) });
    await relayActivityToEntourage(m.deps, { activity: 'reaction', postId: POST, actorId: PARTAGEUR, emoji: '❤️' });
    await relayActivityToEntourage(m.deps, { activity: 'share', postId: POST, actorId: PARTAGEUR });
    expect(m.notified('friend_content_reaction')).toEqual([COMMUN_PROCHE]);
    expect(m.notified('friend_content_share')).toEqual([COMMUN_PROCHE]);
  });
});

describe('l’admission sur son propre contenu (#14069, audit)', () => {
  const partagerLeSien = async (over: Record<string, unknown>, world: World = {}) =>
    (await partager(world, AUTEUR, POST_DE(AUTEUR, over))).relayed;

  it('ONLY : seuls les choisis ; EXCEPT : jamais l’exclu', async () => {
    expect(await partagerLeSien({ visibility: 'ONLY', visibilityUserIds: [PROCHE] })).toEqual([PROCHE]);
    expect(await partagerLeSien({ visibility: 'EXCEPT', visibilityUserIds: [PROCHE] })).not.toContain(PROCHE);
  });

  it('COMMUNITY : un Proche hors des communautés de l’auteur n’est pas prévenu', async () => {
    expect(await partagerLeSien({ visibility: 'COMMUNITY' }, { communities: { c: [AUTEUR, CO_MEMBRE] } })).toEqual([]);
  });

  it('PRIVATE, supprimé, story expirée : personne', async () => {
    expect(await partagerLeSien({ visibility: 'PRIVATE' })).toEqual([]);
    expect(await partagerLeSien({ deletedAt: new Date() })).toEqual([]);
    expect(await partagerLeSien({ type: 'STORY', expiresAt: new Date(Date.now() - 1000) })).toEqual([]);
  });
});

describe('le débit d’un acteur (#14069, audit)', () => {
  it('partager soixante contenus en rafale ne prévient un proche que RELAY_BURST fois', async () => {
    const m = monde({ extraLinks: LIENS_COMMUNS, post: POST_DE(AUTEUR) });
    for (let i = 0; i < 60; i += 1) {
      await relayActivityToEntourage(m.deps, { activity: 'share', postId: `${POST.slice(0, 22)}${String(i).padStart(2, '0')}`, actorId: AUTEUR });
    }
    expect(m.notified('friend_content_share').filter((id) => id === PROCHE)).toHaveLength(RELAY_BURST);
  });

  it('la rafale de partages n’entame pas celle des réactions', async () => {
    const m = monde({ extraLinks: LIENS_COMMUNS, post: POST_DE(AUTEUR) });
    for (let i = 0; i < RELAY_BURST + 2; i += 1) {
      await relayActivityToEntourage(m.deps, { activity: 'share', postId: `${POST.slice(0, 22)}${String(i).padStart(2, '0')}`, actorId: PARTAGEUR });
    }
    await relayActivityToEntourage(m.deps, { activity: 'reaction', postId: POST, actorId: PARTAGEUR, emoji: '❤️' });
    expect(m.notified('friend_content_reaction')).toEqual([COMMUN_PROCHE]);
  });
});
