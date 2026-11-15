/**
 * L'extension `game.photo` (#10162, L10a) : lue par le bloc `game` de `GET /me/engagement`, optionnelle
 * (un serveur antérieur ne la sert pas) et TOLÉRANTE (illisible, elle tombe seule, jamais le bloc).
 */
import { describe, expect, it } from 'vitest';

import {
  GAME_PHOTO_ROUTES,
  GAME_PHOTO_ROUTE_METHODS,
  GAME_ROUTES,
  frameAtmosphereRequestSchema,
  gameBlockExtensionShape,
  gamePhotoBlockSchema,
  photoMomentsKeptRequestSchema,
  photoMomentsKeptResponseSchema,
  photoMomentsPresentedRequestSchema,
} from '../../types/game.js';
import { z } from 'zod';

const extensions = z.object(gameBlockExtensionShape);

const photo = (over: Record<string, unknown> = {}) => ({
  atmosphere: 'egypte',
  invitations: 'major',
  baselineAt: '2026-10-11T08:00:00.000Z',
  baseline: { rank: 'ambassadeur', division: 4, levelRecord: 30, prestige: 0, minted: 12, treasuryTier: 'coffret', flameRecord: 9 },
  treasuryPeakTier: 'coffre',
  moments: [{ stepId: 'rank:ambassadeur:4', detectedAt: '2026-10-11T08:00:00.000Z', presentedAt: null, notifiedAt: null, keptAt: null }],
  ...over,
});

describe('game.photo — l’extension du bloc game', () => {
  it('se lit telle que la passerelle la sert', () => {
    expect(extensions.parse({ photo: photo() }).photo).toEqual(photo());
  });

  it('absente (serveur antérieur) : rien ne tombe', () => {
    expect(extensions.parse({}).photo).toBeUndefined();
  });

  it('illisible (atmosphère hors liste) : elle tombe SEULE', () => {
    const parsed = extensions.parse({ photo: photo({ atmosphere: 'mars' }), prestige: undefined });
    expect(parsed.photo).toBeUndefined();
  });

  it('une ligne servie par un serveur d’avant le signal « immortalisée » (sans `keptAt`) se lit `keptAt: null`', () => {
    const [moment] = gamePhotoBlockSchema.parse(
      photo({ moments: [{ stepId: 'start', detectedAt: null, presentedAt: '2026-10-11T08:00:00.000Z', notifiedAt: null }] }),
    ).moments;
    expect(moment).toEqual({ stepId: 'start', detectedAt: null, presentedAt: '2026-10-11T08:00:00.000Z', notifiedAt: null, keptAt: null });
  });

  it('une ligne de base ou un palier illisibles se lisent « aucun » sans emporter le reste', () => {
    const parsed = gamePhotoBlockSchema.parse(photo({ baseline: { rank: 3 }, treasuryPeakTier: 'galion' }));
    expect(parsed.baseline).toBeNull();
    expect(parsed.treasuryPeakTier).toBeNull();
    expect(parsed.atmosphere).toBe('egypte');
  });
});

describe('GAME_PHOTO_ROUTES — une table à part', () => {
  it('quatre routes neuves, aucune dans GAME_ROUTES (que GameRoutesTests.swift compte)', () => {
    expect(GAME_PHOTO_ROUTES).toEqual({
      frameAtmosphere: '/me/game/frames/atmosphere',
      photoInvitations: '/me/game/photo-moments/invitations',
      photoPresented: '/me/game/photo-moments/presented',
      photoKept: '/me/game/photo-moments/kept',
    });
    expect(GAME_PHOTO_ROUTE_METHODS).toEqual({ frameAtmosphere: 'PUT', photoInvitations: 'PUT', photoPresented: 'POST', photoKept: 'POST' });
    expect(Object.values(GAME_ROUTES)).not.toEqual(expect.arrayContaining(Object.values(GAME_PHOTO_ROUTES)));
  });

  it('une atmosphère hors GLORY_ATMOSPHERES est refusée ; un accusé porte de 1 à 64 étapes', () => {
    expect(frameAtmosphereRequestSchema.safeParse({ requestId: 'req-00001', atmosphere: 'mars' }).success).toBe(false);
    expect(frameAtmosphereRequestSchema.safeParse({ requestId: 'req-00001', atmosphere: 'neon' }).success).toBe(true);
    const ids = (n: number) => Array.from({ length: n }, (_, i) => `meesh:${i + 1}`);
    expect(photoMomentsPresentedRequestSchema.safeParse({ requestId: 'req-00001', stepIds: ids(64) }).success).toBe(true);
    expect(photoMomentsPresentedRequestSchema.safeParse({ requestId: 'req-00001', stepIds: ids(65) }).success).toBe(false);
    expect(photoMomentsPresentedRequestSchema.safeParse({ requestId: 'req-00001', stepIds: [] }).success).toBe(false);
  });

  it('le signal « immortalisée » (D22 b) ne porte que des identifiants d’étape, de 1 à 64 — ni image, ni date de prise', () => {
    const ids = (n: number) => Array.from({ length: n }, (_, i) => `meesh:${i + 1}`);
    expect(photoMomentsKeptRequestSchema.safeParse({ requestId: 'req-00001', stepIds: ids(64) }).success).toBe(true);
    expect(photoMomentsKeptRequestSchema.safeParse({ requestId: 'req-00001', stepIds: ids(65) }).success).toBe(false);
    expect(photoMomentsKeptRequestSchema.safeParse({ requestId: 'req-00001', stepIds: [] }).success).toBe(false);
    expect(photoMomentsKeptRequestSchema.safeParse({ requestId: 'req-00001', stepIds: ['start'], takenAt: '2026-10-21T08:00:00.000Z' }).success).toBe(false);
    expect(photoMomentsKeptRequestSchema.safeParse({ requestId: 'req-00001', stepIds: ['start'], image: 'data:image/jpeg;base64,AA==' }).success).toBe(false);
    expect(photoMomentsKeptResponseSchema.parse({ kept: [{ stepId: 'start', keptAt: '2026-10-21T08:00:00.000Z' }] })).toEqual({
      kept: [{ stepId: 'start', keptAt: '2026-10-21T08:00:00.000Z' }],
    });
  });
});
