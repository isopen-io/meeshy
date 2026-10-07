/**
 * Les plafonds par CHEMIN (#9584, mécanisme demandé par le porteur le
 * 2026-10-07) : par personne et par jour civil, combien de commentaires et de
 * réactions rapportent encore, selon qu'ils sont faits SUR un original ou VIA
 * une republication. Les valeurs sont réglables par l'administration ; les
 * défauts sont les plafonds actuels — aucun plafond propre au chemin, celui de
 * l'opération s'appliquant seul.
 */
import { describe, it, expect } from 'vitest';
import {
  DEFAULT_ENGAGEMENT_SCALE,
  DEFAULT_PATH_CAPS,
  parseEngagementScale,
  pathCapOf,
  type EngagementScale,
} from '../types/engagement-scale.js';

const withPathCaps = (pathCaps: unknown): unknown => ({ ...DEFAULT_ENGAGEMENT_SCALE, pathCaps });

describe('les plafonds par chemin', () => {
  it('ne plafonnent rien par défaut — le comportement d’avant est inchangé', () => {
    expect(DEFAULT_PATH_CAPS).toEqual({
      comment: { original: null, repost: null },
      reaction: { original: null, repost: null },
    });
    expect(pathCapOf(DEFAULT_ENGAGEMENT_SCALE, 'comment.text', 'repost')).toEqual({ family: 'comment', path: 'repost', limit: null });
  });

  it('s’appliquent aux commentaires (texte et vocal) et aux réactions de post, par chemin', () => {
    const scale = parseEngagementScale(withPathCaps({ comment: { original: 5000, repost: 1000 }, reaction: { original: 10000, repost: 5000 } })) as EngagementScale;

    expect(pathCapOf(scale, 'comment.text', 'original')).toEqual({ family: 'comment', path: 'original', limit: 5000 });
    expect(pathCapOf(scale, 'comment.audio', 'repost')).toEqual({ family: 'comment', path: 'repost', limit: 1000 });
    expect(pathCapOf(scale, 'tool.post_reaction', 'repost')).toEqual({ family: 'reaction', path: 'repost', limit: 5000 });
    expect(pathCapOf(scale, 'tool.post_reaction', 'original')).toEqual({ family: 'reaction', path: 'original', limit: 10000 });
  });

  it('ne concernent aucune autre opération', () => {
    expect(pathCapOf(DEFAULT_ENGAGEMENT_SCALE, 'tool.post_bookmark', 'repost')).toBeNull();
    expect(pathCapOf(DEFAULT_ENGAGEMENT_SCALE, 'tool.comment_like', 'original')).toBeNull();
  });

  it('un barème réglé avant eux se relit avec les défauts', () => {
    const { pathCaps: _absent, ...legacy } = { ...DEFAULT_ENGAGEMENT_SCALE, pathCaps: undefined };
    expect(parseEngagementScale(legacy)?.pathCaps).toEqual(DEFAULT_PATH_CAPS);
  });

  it.each([
    ['un plafond négatif', { comment: { original: -1, repost: null }, reaction: { original: null, repost: null } }],
    ['un plafond fractionnaire', { comment: { original: 1.5, repost: null }, reaction: { original: null, repost: null } }],
    ['une famille manquante', { comment: { original: null, repost: null } }],
    ['un chemin manquant', { comment: { original: null }, reaction: { original: null, repost: null } }],
  ])('refusent %s', (_label, pathCaps) => {
    expect(parseEngagementScale(withPathCaps(pathCaps))).toBeNull();
  });
});
