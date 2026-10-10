/**
 * Ce qu'un post a rapporté à son LECTEUR (#9569) — le contrat que la passerelle
 * émet et que le web et iOS lisent : la charge de `engagement:post-updated`.
 */
import { describe, it, expect } from 'vitest';
import { isPostEngagementSnapshot, keptViewerPoints, type PostEngagementSnapshot } from '../types/engagement-scale.js';
import { SERVER_EVENTS, CLIENT_EVENTS } from '../types/socketio-events.js';

const POST_ID = '507f1f77bcf86cd799439011';

const snapshot = (overrides: Partial<Record<keyof PostEngagementSnapshot, unknown>> = {}): unknown => ({
  postId: POST_ID,
  viewerPoints: 99,
  at: 1_760_000_000_000,
  ...overrides,
});

describe('la charge de engagement:post-updated', () => {
  it('reconnaît le post, les points qu’il a rapportés au lecteur et l’instant serveur où ils ont été lus', () => {
    expect(isPostEngagementSnapshot(snapshot())).toBe(true);
  });

  it('admet zéro — un post dont tout le crédit a été repris', () => {
    expect(isPostEngagementSnapshot(snapshot({ viewerPoints: 0 }))).toBe(true);
  });

  it.each([
    ['des points négatifs', snapshot({ viewerPoints: -1 })],
    ['des points fractionnaires', snapshot({ viewerPoints: 1.5 })],
    ['des points en chaîne', snapshot({ viewerPoints: '99' })],
    ['des points absents', { postId: POST_ID, at: 1 }],
    ['un instant absent', { postId: POST_ID, viewerPoints: 99 }],
    ['un instant négatif', snapshot({ at: -1 })],
    ['un post absent', { viewerPoints: 99, at: 1 }],
    ['un post vide', snapshot({ postId: '' })],
    ['ce qui n’est pas un objet', null],
    ['un tableau', [POST_ID, 99]],
  ])('refuse %s', (_label, value) => {
    expect(isPostEngagementSnapshot(value)).toBe(false);
  });
});

describe('le nom de l’événement', () => {
  it('suit la convention entité:action-mot, dans la lignée de celui des conversations', () => {
    expect(SERVER_EVENTS.ENGAGEMENT_POST_UPDATED).toBe('engagement:post-updated');
  });

  it('ne se déclare que du serveur vers le client — aucun client ne l’annonce', () => {
    expect(Object.values(CLIENT_EVENTS)).not.toContain('engagement:post-updated');
  });
});

/**
 * La valeur n'est PAS monotone : retirer une réaction, un commentaire ou une
 * publication reprend ses points (décision porteur 2026-10-07). Deux annonces
 * d'un même post peuvent arriver dans le désordre — chacune porte l'instant
 * serveur où elle a été lue, et la plus RÉCENTE gagne, qu'elle monte ou baisse.
 * Une lecture (fil, fiche) ne porte pas d'instant : elle s'applique telle
 * quelle, et garde l'instant de la dernière annonce, pour qu'une annonce plus
 * ancienne arrivée ensuite ne la défasse pas.
 */
describe('ce qu’un client garde quand une valeur lui arrive', () => {
  it('pose la première valeur reçue, annonce ou lecture', () => {
    expect(keptViewerPoints(undefined, { viewerPoints: 4, at: 10 })).toEqual({ viewerPoints: 4, at: 10 });
    expect(keptViewerPoints(undefined, { viewerPoints: 4 })).toEqual({ viewerPoints: 4, at: null });
  });

  it('suit une annonce plus récente, qu’elle monte ou qu’elle baisse — une reprise baisse', () => {
    expect(keptViewerPoints({ viewerPoints: 4, at: 10 }, { viewerPoints: 7, at: 20 })).toEqual({ viewerPoints: 7, at: 20 });
    expect(keptViewerPoints({ viewerPoints: 7, at: 20 }, { viewerPoints: 4, at: 30 })).toEqual({ viewerPoints: 4, at: 30 });
  });

  it('ignore une annonce plus ancienne arrivée en retard', () => {
    expect(keptViewerPoints({ viewerPoints: 7, at: 20 }, { viewerPoints: 4, at: 10 })).toEqual({ viewerPoints: 7, at: 20 });
  });

  it('applique une lecture et garde l’instant de la dernière annonce', () => {
    expect(keptViewerPoints({ viewerPoints: 7, at: 20 }, { viewerPoints: 3 })).toEqual({ viewerPoints: 3, at: 20 });
    expect(keptViewerPoints({ viewerPoints: 3, at: 20 }, { viewerPoints: 9, at: 15 })).toEqual({ viewerPoints: 3, at: 20 });
  });

  it('garde ce qu’il sait quand la réponse ne porte pas le champ — une écriture, un ancien serveur', () => {
    expect(keptViewerPoints({ viewerPoints: 7, at: 20 }, {})).toEqual({ viewerPoints: 7, at: 20 });
    expect(keptViewerPoints(undefined, {})).toBeUndefined();
  });

  it('pose zéro comme une valeur', () => {
    expect(keptViewerPoints({ viewerPoints: 3, at: 20 }, { viewerPoints: 0, at: 30 })).toEqual({ viewerPoints: 0, at: 30 });
  });
});
