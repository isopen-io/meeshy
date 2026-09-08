/**
 * @jest-environment node
 *
 * PostService.createPost — géolocalisation de découvrabilité, extrait de
 * PostService.test.ts (#3637) pour ne pas faire grossir un fichier déjà
 * hors budget (`gateway-test-file-size-budget.test.ts`) — la règle 3 du
 * cliquet interdit d'empiler sur un fichier de la liste héritée.
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { PostService } from '../../services/PostService';
import { MediaService } from '../../services/MediaService';
import type { PostReactionService } from '../../services/PostReactionService';
import { PostType, PostVisibility } from '@meeshy/shared/prisma/client';
import { createMockPrisma, makePost, createMockPostReactionService } from './post-service-mocks';

// PostAudioService uses a singleton that requires initialization — mock it entirely
// so PostService tests don't depend on ZMQ / SocialEventsHandler setup.
jest.mock('../../services/posts/PostAudioService', () => ({
  PostAudioService: {
    shared: {
      processPostAudio: jest.fn().mockReturnValue(Promise.resolve()),
    },
    init: jest.fn(),
  },
}));

describe('PostService — createPost geo discoverability (INDÉPENDANTE de metadata.location)', () => {
  let prisma: ReturnType<typeof createMockPrisma>;
  let mediaService: MediaService;
  let mockReactionService: PostReactionService;
  let service: PostService;

  beforeEach(() => {
    jest.clearAllMocks();
    prisma = createMockPrisma();
    mediaService = new MediaService();
    mockReactionService = createMockPostReactionService();
    service = new PostService(prisma, mediaService, undefined, mockReactionService);
  });

  const basePostData = { type: PostType.POST, visibility: PostVisibility.PUBLIC };
  const place = { latitude: 48.8584, longitude: 2.2945, name: 'Tour Eiffel', address: null, category: null };

  it('persists geoPoint/geoPrecision when discoverabilityPrecision is provided with a valid location', async () => {
    prisma.post.create.mockImplementation(async (args: any) => makePost({ id: 'geo-1', ...args.data }));

    await service.createPost({
      ...basePostData,
      location: place,
      discoverabilityPrecision: 'CITY',
    }, 'user-1');

    const createCall = prisma.post.create.mock.calls[0][0];
    // CITY arrondit à 0.1° (~10km) — cf. geoDiscoverability.ts.
    expect(createCall.data.geoPoint).toEqual({ type: 'Point', coordinates: [2.3, 48.9] });
    expect(createCall.data.geoPrecision).toBe('CITY');
  });

  // #3637 — "Défaut NEIGHBORHOOD, EXACT réservé à un opt-in explicite,
  // jamais pour un mineur". EXACT n'est plus jamais implicite : il faut à
  // la fois `discoverabilityPrecisionConfirmed: true` ET un auteur dont la
  // majorité est VÉRIFIÉE (`User.birthDate`, via `isAdult()`).
  it('downgrades EXACT to NEIGHBORHOOD when the explicit confirmation is missing', async () => {
    prisma.post.create.mockImplementation(async (args: any) => makePost({ id: 'geo-2', ...args.data }));
    prisma.user.findUnique.mockResolvedValue({ birthDate: new Date('1990-01-01') });

    await service.createPost({
      ...basePostData,
      location: place,
      discoverabilityPrecision: 'EXACT',
    }, 'user-1');

    const createCall = prisma.post.create.mock.calls[0][0];
    // NEIGHBORHOOD arrondit à 0.01° (~1km) — cf. geoDiscoverability.ts.
    expect(createCall.data.geoPoint).toEqual({ type: 'Point', coordinates: [2.29, 48.86] });
    expect(createCall.data.geoPrecision).toBe('NEIGHBORHOOD');
  });

  it('downgrades EXACT to NEIGHBORHOOD when confirmed but the author\'s majority is unverified (no birthDate)', async () => {
    prisma.post.create.mockImplementation(async (args: any) => makePost({ id: 'geo-2b', ...args.data }));
    prisma.user.findUnique.mockResolvedValue(null);

    await service.createPost({
      ...basePostData,
      location: place,
      discoverabilityPrecision: 'EXACT',
      discoverabilityPrecisionConfirmed: true,
    } as any, 'user-1');

    const createCall = prisma.post.create.mock.calls[0][0];
    expect(createCall.data.geoPrecision).toBe('NEIGHBORHOOD');
  });

  it('downgrades EXACT to NEIGHBORHOOD when confirmed but the author is a minor', async () => {
    prisma.post.create.mockImplementation(async (args: any) => makePost({ id: 'geo-2c', ...args.data }));
    const fifteenYearsAgo = new Date();
    fifteenYearsAgo.setFullYear(fifteenYearsAgo.getFullYear() - 15);
    prisma.user.findUnique.mockResolvedValue({ birthDate: fifteenYearsAgo });

    await service.createPost({
      ...basePostData,
      location: place,
      discoverabilityPrecision: 'EXACT',
      discoverabilityPrecisionConfirmed: true,
    } as any, 'user-1');

    const createCall = prisma.post.create.mock.calls[0][0];
    expect(createCall.data.geoPrecision).toBe('NEIGHBORHOOD');
  });

  it('grants EXACT only when explicitly confirmed AND the author is a verified adult', async () => {
    prisma.post.create.mockImplementation(async (args: any) => makePost({ id: 'geo-2d', ...args.data }));
    prisma.user.findUnique.mockResolvedValue({ birthDate: new Date('1990-01-01') });

    await service.createPost({
      ...basePostData,
      location: place,
      discoverabilityPrecision: 'EXACT',
      discoverabilityPrecisionConfirmed: true,
    } as any, 'user-1');

    const createCall = prisma.post.create.mock.calls[0][0];
    expect(createCall.data.geoPoint).toEqual({ type: 'Point', coordinates: [2.2945, 48.8584] });
    expect(createCall.data.geoPrecision).toBe('EXACT');
  });

  it('never consults the author\'s birthDate for a non-EXACT precision', async () => {
    prisma.post.create.mockImplementation(async (args: any) => makePost({ id: 'geo-2e', ...args.data }));

    await service.createPost({
      ...basePostData,
      location: place,
      discoverabilityPrecision: 'CITY',
    }, 'user-1');

    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  it('leaves geoPoint/geoPrecision null when discoverabilityPrecision is absent, even with a valid location', async () => {
    prisma.post.create.mockImplementation(async (args: any) => makePost({ id: 'geo-3', ...args.data }));

    await service.createPost({ ...basePostData, location: place }, 'user-1');

    const createCall = prisma.post.create.mock.calls[0][0];
    expect(createCall.data.geoPoint).toBeUndefined();
    expect(createCall.data.geoPrecision).toBeUndefined();
  });

  it('leaves geoPoint/geoPrecision null when discoverabilityPrecision is provided but location is absent', async () => {
    prisma.post.create.mockImplementation(async (args: any) => makePost({ id: 'geo-4', ...args.data }));

    await service.createPost({ ...basePostData, discoverabilityPrecision: 'CITY' }, 'user-1');

    const createCall = prisma.post.create.mock.calls[0][0];
    expect(createCall.data.geoPoint).toBeUndefined();
    expect(createCall.data.geoPrecision).toBeUndefined();
  });

  it('ignores a client-supplied geoPoint/geoPrecision passthrough — the server always recomputes its own', async () => {
    prisma.post.create.mockImplementation(async (args: any) => makePost({ id: 'geo-5', ...args.data }));

    await service.createPost({
      ...basePostData,
      // Un attaquant qui contournerait le schéma Zod de la route et
      // fournirait ces champs directement au service ne doit jamais les
      // voir atterrir tels quels dans l'écriture Prisma — même garde que
      // `metadata` (cf. sharedPlace.ts).
      geoPoint: { type: 'Point', coordinates: [999, 999] },
      geoPrecision: 'EXACT',
    } as any, 'user-1');

    const createCall = prisma.post.create.mock.calls[0][0];
    expect(createCall.data.geoPoint).toBeUndefined();
    expect(createCall.data.geoPrecision).toBeUndefined();
  });

  it('does not persist geoPoint/geoPrecision when the location coordinates are invalid, even with a valid precision', async () => {
    prisma.post.create.mockImplementation(async (args: any) => makePost({ id: 'geo-6', ...args.data }));

    await service.createPost({
      ...basePostData,
      location: { latitude: 999, longitude: 2.2945, name: null, address: null, category: null },
      discoverabilityPrecision: 'CITY',
    }, 'user-1');

    const createCall = prisma.post.create.mock.calls[0][0];
    expect(createCall.data.geoPoint).toBeUndefined();
    expect(createCall.data.geoPrecision).toBeUndefined();
  });
});
