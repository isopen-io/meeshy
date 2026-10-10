/**
 * Ce que les liens de suivi créditent (#8959) : la création EXPLICITE d'un
 * lien paie `social.tracked_link` à son auteur, la réécriture automatique des
 * URL d'un message ne paie rien ; la visite d'un lien crédite son créateur
 * par `recordLinkVisit`, avec la clé de visiteur calculée par le serveur.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import type { PrismaClient } from '@meeshy/shared/prisma/client';

jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: {
    child: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }),
    warn: jest.fn(),
  },
}));

import { TrackingLinkService, type TrackingLinkEngagement } from '../../../services/TrackingLinkService';

type Link = {
  id: string;
  token: string;
  originalUrl: string;
  shortUrl: string;
  isActive: boolean;
  expiresAt: Date | null;
  createdBy: string | null;
};

const makeLink = (overrides: Partial<Link> = {}): Link => ({
  id: 'link-1',
  token: 'ABC123',
  originalUrl: 'https://example.com',
  shortUrl: '/l/ABC123',
  isActive: true,
  expiresAt: null,
  createdBy: 'creator-1',
  ...overrides,
});

const makePrisma = (options: { existing?: Link | null; created?: Link } = {}): PrismaClient => {
  const created = options.created ?? makeLink();
  const existing = options.existing === undefined ? null : options.existing;
  const double = {
    trackingLink: {
      findUnique: jest.fn(async (args: { where: { token: string } }) =>
        existing && existing.token === args.where.token ? existing : null),
      findFirst: jest.fn(async () => null),
      create: jest.fn(async () => created),
      update: jest.fn(async () => existing ?? created),
    },
    trackingLinkClick: {
      create: jest.fn(async () => ({ id: 'click-1' })),
      findFirst: jest.fn(async () => null),
    },
  };
  return double as unknown as PrismaClient;
};

type RecordActivity = TrackingLinkEngagement['recordActivity'];
type RecordLinkVisit = TrackingLinkEngagement['recordLinkVisit'];

const makeEngagement = () => {
  const recordActivity = jest.fn<RecordActivity>(async () => undefined);
  const recordLinkVisit = jest.fn<RecordLinkVisit>(async () => 1);
  const engagement: TrackingLinkEngagement = { recordActivity, recordLinkVisit };
  return { engagement, recordActivity, recordLinkVisit };
};

const flush = () => new Promise((resolve) => setImmediate(resolve));

describe('TrackingLinkService — crédit de création', () => {
  it('crédite social.tracked_link quand la création est explicite', async () => {
    const { engagement, recordActivity } = makeEngagement();
    const sut = new TrackingLinkService(makePrisma(), engagement);

    await sut.createTrackingLink({ originalUrl: 'https://example.com', createdBy: 'creator-1', creditCreator: true });
    await flush();

    expect(recordActivity).toHaveBeenCalledWith('creator-1', 'social.tracked_link');
  });

  it('ne crédite rien quand le lien naît de la réécriture automatique d\'un message', async () => {
    const { engagement, recordActivity } = makeEngagement();
    const sut = new TrackingLinkService(makePrisma(), engagement);

    await sut.processMessageLinks({ content: 'voir https://example.com/page', createdBy: 'creator-1' });
    await sut.processExplicitLinksInContent({ content: 'voir [[https://example.com/x]]', createdBy: 'creator-1' });
    await flush();

    expect(recordActivity).not.toHaveBeenCalled();
  });

  it('ne crédite personne quand le lien n\'a pas d\'auteur', async () => {
    const { engagement, recordActivity } = makeEngagement();
    const sut = new TrackingLinkService(makePrisma(), engagement);

    await sut.createTrackingLink({ originalUrl: 'https://example.com', creditCreator: true });
    await flush();

    expect(recordActivity).not.toHaveBeenCalled();
  });

  it('un crédit en panne ne fait pas échouer la création', async () => {
    const recordActivity = jest.fn<RecordActivity>(async () => { throw new Error('engagement down'); });
    const engagement: TrackingLinkEngagement = { recordActivity, recordLinkVisit: jest.fn<RecordLinkVisit>(async () => 0) };
    const sut = new TrackingLinkService(makePrisma(), engagement);

    await expect(
      sut.createTrackingLink({ originalUrl: 'https://example.com', createdBy: 'creator-1', creditCreator: true }),
    ).resolves.toEqual(expect.objectContaining({ token: 'ABC123' }));
  });
});

describe('TrackingLinkService — crédit de visite', () => {
  it('crédite le créateur par recordLinkVisit avec la clé tracked:<token>', async () => {
    const { engagement, recordLinkVisit } = makeEngagement();
    const sut = new TrackingLinkService(makePrisma({ existing: makeLink() }), engagement);

    await sut.recordClick({ token: 'ABC123', visitor: { key: 'user:visitor-1', userId: 'visitor-1' } });
    await flush();

    expect(recordLinkVisit).toHaveBeenCalledWith({
      creatorId: 'creator-1',
      linkKey: 'tracked:ABC123',
      visitorKey: 'user:visitor-1',
      visitorUserId: 'visitor-1',
    });
  });

  it('ne crédite rien pour un lien sans créateur', async () => {
    const { engagement, recordLinkVisit } = makeEngagement();
    const sut = new TrackingLinkService(makePrisma({ existing: makeLink({ createdBy: null }) }), engagement);

    await sut.recordClick({ token: 'ABC123', visitor: { key: 'anon:abc', userId: null } });
    await flush();

    expect(recordLinkVisit).not.toHaveBeenCalled();
  });

  it('ne crédite rien quand l\'appelant ne fournit pas de visiteur', async () => {
    const { engagement, recordLinkVisit } = makeEngagement();
    const sut = new TrackingLinkService(makePrisma({ existing: makeLink() }), engagement);

    await sut.recordClick({ token: 'ABC123' });
    await flush();

    expect(recordLinkVisit).not.toHaveBeenCalled();
  });

  it('un crédit de visite en panne ne fait pas échouer le clic', async () => {
    const recordLinkVisit = jest.fn<RecordLinkVisit>(async () => { throw new Error('engagement down'); });
    const engagement: TrackingLinkEngagement = { recordActivity: jest.fn<RecordActivity>(async () => undefined), recordLinkVisit };
    const sut = new TrackingLinkService(makePrisma({ existing: makeLink() }), engagement);

    await expect(
      sut.recordClick({ token: 'ABC123', visitor: { key: 'anon:abc', userId: null } }),
    ).resolves.toEqual(expect.objectContaining({ click: { id: 'click-1' } }));
  });
});
