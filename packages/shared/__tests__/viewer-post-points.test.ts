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
  ...overrides,
});

describe('la charge de engagement:post-updated', () => {
  it('reconnaît le post et les points qu’il a rapportés au lecteur', () => {
    expect(isPostEngagementSnapshot(snapshot())).toBe(true);
  });

  it('admet zéro — un post dont tout le crédit a été repris', () => {
    expect(isPostEngagementSnapshot(snapshot({ viewerPoints: 0 }))).toBe(true);
  });

  it.each([
    ['des points négatifs', snapshot({ viewerPoints: -1 })],
    ['des points fractionnaires', snapshot({ viewerPoints: 1.5 })],
    ['des points en chaîne', snapshot({ viewerPoints: '99' })],
    ['des points absents', { postId: POST_ID }],
    ['un post absent', { viewerPoints: 99 }],
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
 * Deux valeurs d'un même post peuvent arriver dans le DÉSORDRE : deux gestes
 * rapprochés dont les annonces se croisent, ou une lecture de fil partie avant
 * un geste et rendue après son annonce. Tant que le post existe, ce qu'il a
 * rapporté ne décroît jamais — la plus grande des deux est donc la plus récente.
 */
describe('ce qu’un client garde quand une valeur lui arrive', () => {
  it('pose la première valeur reçue', () => {
    expect(keptViewerPoints(undefined, 4)).toBe(4);
  });

  it('monte vers une valeur plus grande', () => {
    expect(keptViewerPoints(4, 7)).toBe(7);
  });

  it('ne redescend pas vers une valeur plus ancienne arrivée en retard', () => {
    expect(keptViewerPoints(7, 4)).toBe(7);
  });

  it('garde ce qu’il sait quand la réponse ne porte pas le champ — une écriture, un ancien serveur', () => {
    expect(keptViewerPoints(7, undefined)).toBe(7);
  });

  it('ne sait rien tant que rien n’est arrivé', () => {
    expect(keptViewerPoints(undefined, undefined)).toBeUndefined();
  });

  it('pose zéro comme une valeur — un post qui n’a rien rapporté', () => {
    expect(keptViewerPoints(undefined, 0)).toBe(0);
    expect(keptViewerPoints(3, 0)).toBe(3);
  });
});
