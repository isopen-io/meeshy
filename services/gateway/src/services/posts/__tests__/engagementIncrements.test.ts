/**
 * @jest-environment node
 *
 * Les témoins d'`engagementAggregateIncrements` — le calcul des compteurs
 * dénormalisés d'une NOUVELLE session d'engagement (spec §19.3), extrait de
 * `PostService` par le lot qui a réparé le rouge de `gateway-file-size-budget`
 * règle 3 sur `dev` (#4596).
 *
 * ## Ce qu'ils ajoutent aux témoins existants
 *
 * `__tests__/posts-engagement.test.ts` exerce la même règle À TRAVERS
 * `recordEngagementBatch` : il monte un double Prisma, pousse une session
 * complète et lit `lastUpdateData()`. Ces témoins-là gardent le CÂBLAGE — que
 * la route passe bien par ce calcul, et que son résultat atteigne
 * `prisma.post.update`. Ils restent, inchangés.
 *
 * Ceux-ci gardent la RÈGLE, à l'endroit où ses deux seuils sont nommables. Le
 * discriminant de position — 90 % sous 8300 ms, 30 % au-delà — n'était
 * exerçable que par une session de bout en bout dont la durée média devait
 * être choisie de part et d'autre d'une constante LOCALE au corps de la
 * méthode, invisible depuis le témoin. C'est exactement la forme qu'un
 * inventaire de cas dérouler rend lisible.
 *
 * **Écrits en NÉGATIF là où la propriété est un refus** : « n'incrémente PAS
 * `postOpenCount` » a une valeur que « incrémente sur reels » n'a pas — c'est
 * le double comptage de la page Detail que la règle empêche, et un `toEqual`
 * sur l'objet ENTIER affirme autant sur ce qu'il admet que sur ce qu'il garde.
 */
import { describe, it, expect } from '@jest/globals';

import { engagementAggregateIncrements, type EngagementSession } from '../engagementIncrements';

const session = (over: Partial<EngagementSession> = {}): EngagementSession => ({
  surface: 'detail',
  contentType: 'video',
  dwellMs: 0,
  completed: false,
  watchSamples: [],
  ...over,
});

describe('engagementAggregateIncrements — ouverture de post', () => {
  it('compte une ouverture sur la surface reels', () => {
    expect(engagementAggregateIncrements(session({ surface: 'reels' })))
      .toEqual({ postOpenCount: { increment: 1 } });
  });

  it('ne compte AUCUNE ouverture sur la surface detail — elle est déjà comptée par /impression?source=detail', () => {
    expect(engagementAggregateIncrements(session({ surface: 'detail' }))).toEqual({});
  });

  it('ne compte aucune ouverture sur une surface éphémère (story), qui a ses propres métriques', () => {
    expect(engagementAggregateIncrements(session({ surface: 'story' }))).toEqual({});
  });
});

describe('engagementAggregateIncrements — lecture complète', () => {
  it('compte une lecture quand la session est déclarée complète', () => {
    expect(engagementAggregateIncrements(session({ completed: true })))
      .toMatchObject({ playCount: { increment: 1 } });
  });

  it('ne compte aucune lecture quand elle ne l est pas', () => {
    expect(engagementAggregateIncrements(session({ completed: false })))
      .not.toHaveProperty('playCount');
  });
});

describe('engagementAggregateIncrements — vue qualifiée par le TEMPS', () => {
  it('qualifie dès 2500 ms de visionnage', () => {
    expect(engagementAggregateIncrements(session({ watchMs: 2500 })))
      .toMatchObject({ qualifiedViewCount: { increment: 1 } });
  });

  it('ne qualifie pas à 2499 ms', () => {
    expect(engagementAggregateIncrements(session({ watchMs: 2499 })))
      .not.toHaveProperty('qualifiedViewCount');
  });

  it('retombe sur le temps PASSÉ quand le visionnage est inconnu', () => {
    expect(engagementAggregateIncrements(session({ dwellMs: 2500 })))
      .toMatchObject({ qualifiedViewCount: { increment: 1 } });
  });

  it('ignore le temps passé dès que le visionnage est connu — les deux ne s additionnent pas', () => {
    expect(engagementAggregateIncrements(session({ watchMs: 0, dwellMs: 99999 })))
      .not.toHaveProperty('qualifiedViewCount');
  });
});

describe('engagementAggregateIncrements — vue qualifiée par la POSITION', () => {
  const atPosition = (positionMs: number, mediaDurationMs: number) =>
    engagementAggregateIncrements(session({
      mediaDurationMs,
      watchMs: 0,
      watchSamples: [{ positionMs: 1 }, { positionMs }, { positionMs: 0 }],
    }));

  it('exige 90 % sur un format COURT (< 8300 ms)', () => {
    expect(atPosition(7200, 8000)).toMatchObject({ qualifiedViewCount: { increment: 1 } });
    expect(atPosition(7100, 8000)).not.toHaveProperty('qualifiedViewCount');
  });

  it('n exige que 30 % dès 8300 ms — le seuil est un SEUIL, pas une borne stricte', () => {
    expect(atPosition(2490, 8300)).toMatchObject({ qualifiedViewCount: { increment: 1 } });
    expect(atPosition(2400, 8300)).not.toHaveProperty('qualifiedViewCount');
  });

  it('retient la position MAXIMALE atteinte, quel que soit l ordre des échantillons', () => {
    expect(atPosition(9000, 10000)).toMatchObject({ qualifiedViewCount: { increment: 1 } });
  });

  it('ne qualifie jamais par la position quand la durée du média est inconnue — 0/0 ne vaut pas 100 %', () => {
    expect(engagementAggregateIncrements(session({ watchMs: 0, watchSamples: [{ positionMs: 9999 }] })))
      .not.toHaveProperty('qualifiedViewCount');
  });

  it('ignore un échantillon dont positionMs n est pas un nombre', () => {
    expect(engagementAggregateIncrements(session({
      mediaDurationMs: 8000,
      watchMs: 0,
      watchSamples: [{ positionMs: '7900' }, null, undefined, 42],
    }))).not.toHaveProperty('qualifiedViewCount');
  });
});

describe('engagementAggregateIncrements — cumul', () => {
  it('cumule les trois compteurs sur une session reels complète et qualifiante', () => {
    expect(engagementAggregateIncrements(session({
      surface: 'reels',
      completed: true,
      watchMs: 5000,
    }))).toEqual({
      postOpenCount: { increment: 1 },
      playCount: { increment: 1 },
      qualifiedViewCount: { increment: 1 },
    });
  });

  it('rend un objet VIDE quand rien ne se déclenche — le site d appel s en sert pour n écrire aucune ligne', () => {
    expect(engagementAggregateIncrements(session())).toEqual({});
  });
});
