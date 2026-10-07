/**
 * Ce qu'un post a rapporté à son LECTEUR (#9569) — le contrat que la passerelle
 * émet et que le web et iOS lisent : la charge de `engagement:post-updated`.
 */
import { describe, it, expect } from 'vitest';
import { isPostEngagementSnapshot, type PostEngagementSnapshot } from '../types/engagement-scale.js';
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
