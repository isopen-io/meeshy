/**
 * LES MIROIRS D'AUDIENCE NE REPLIENT PAS UN CERCLE SUR « TOUS LES AMIS » (#13931).
 *
 * Trois sites énumèrent ou jugent l'audience d'une publication à côté du fil :
 * le temps réel social (`SocialEventsHandler`), la diffusion des traductions de
 * story (`StoryTextObjectTranslationService`) et l'atteignabilité d'un
 * signalement (`routes/reports/target`). Avant ce lot, toute valeur qu'ils ne
 * connaissaient pas retombait sur « les amis » : un post `CLOSE` ou `BLOOD`
 * partait, en entier, à des Amis qui n'ont pas le droit de le lire.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import { ROOMS } from '@meeshy/shared/types/socketio-events';
import { SocialEventsHandler } from '../../socketio/handlers/SocialEventsHandler';
import { StoryTextObjectTranslationService } from '../../services/posts/StoryTextObjectTranslationService';
import { verifierCible } from '../../routes/reports/target';
import { relationStore } from '../helpers/user-relation-store';

const hex = (letter: string): string => letter.repeat(24);
const AUTHOR = hex('a');
const ACQ = hex('b');
const FRI = hex('c');
const CLS = hex('d');
const BLD = hex('e');
const STR = hex('1');
const POST_ID = hex('7');
const NOW = new Date('2026-10-31T10:00:00Z');

const link = (other: string, level: string) => {
  const [userLowId, userHighId] = AUTHOR < other ? [AUTHOR, other] : [other, AUTHOR];
  return { id: `r-${other}`, userLowId, userHighId, grantedByLow: level, grantedByHigh: level, transitions: [], updatedAt: NOW };
};

const graph = () =>
  relationStore({
    relations: [link(ACQ, 'ACQUAINTANCE'), link(FRI, 'FRIEND'), link(CLS, 'CLOSE'), link(BLD, 'BLOOD')],
  }).prisma;

const roomsOf = (io: { to: jest.Mock }): string[] => [...new Set(io.to.mock.calls.map((call) => String(call[0])))].sort();
const feeds = (...ids: string[]): string[] => ids.map((id) => ROOMS.feed(id)).sort();

const makeIo = () => {
  const emit = jest.fn();
  return { to: jest.fn().mockReturnValue({ emit }), emit } as unknown as { to: jest.Mock; emit: jest.Mock };
};

describe('le temps réel social — broadcastPostCreated', () => {
  const broadcast = async (visibility: string) => {
    const io = makeIo();
    const prisma = {
      ...graph(),
      communityMember: { findMany: jest.fn<any>(async () => []) },
      user: { findMany: jest.fn<any>(async () => []), findUnique: jest.fn<any>(async () => null) },
    };
    const handler = new SocialEventsHandler({ io: io as never, prisma: prisma as never });
    await handler.broadcastPostCreated({ id: POST_ID, authorId: AUTHOR, type: 'POST', visibility, visibilityUserIds: [] } as never, AUTHOR);
    return roomsOf(io);
  };

  it('ACQUAINTANCES atteint Connaissances, Amis, Proches, Sang et l\'auteur', async () => {
    expect(await broadcast('ACQUAINTANCES')).toEqual(feeds(ACQ, FRI, CLS, BLD, AUTHOR));
  });

  it('CLOSE n\'atteint que Proches, Sang et l\'auteur : ni l\'Ami ni la Connaissance', async () => {
    expect(await broadcast('CLOSE')).toEqual(feeds(CLS, BLD, AUTHOR));
  });

  it('BLOOD n\'atteint que le Sang et l\'auteur', async () => {
    expect(await broadcast('BLOOD')).toEqual(feeds(BLD, AUTHOR));
  });

  it('FRIENDS reste « Amis et au-dessus » : la Connaissance n\'est pas servie', async () => {
    expect(await broadcast('FRIENDS')).toEqual(feeds(FRI, CLS, BLD, AUTHOR));
  });
});

describe('la diffusion des traductions de story', () => {
  const textDoc = () => ({
    v: 3,
    scenes: [
      {
        id: 's1',
        objects: [
          {
            id: 't1',
            kind: 'text',
            anchor: { t: 'free', x: 0.5, y: 0.4 },
            plane: 'fg',
            z: 1,
            locale: 'fr',
            transform: { scale: 1, rotation: 0, opacity: 1 },
            payload: { text: 'Bonjour', textStyle: 'bold' },
          },
        ],
      },
    ],
  });

  const translate = async (visibility: string) => {
    const io = makeIo();
    const prisma = {
      ...graph(),
      post: {
        findUnique: jest.fn<any>(async () => ({
          authorId: AUTHOR,
          visibility,
          visibilityUserIds: [],
          content: 'Bonjour',
          storyEffects: textDoc(),
        })),
      },
      communityMember: { findMany: jest.fn<any>(async () => []) },
      $runCommandRaw: jest.fn<any>(async () => ({ ok: 1 })),
    };
    // @ts-expect-error réinitialise le singleton privé
    StoryTextObjectTranslationService._shared = null;
    const service = StoryTextObjectTranslationService.init(prisma as never, io as never);
    await service.handleTranslationCompleted({ postId: POST_ID, textObjectIndex: 0, translations: { en: 'Hello' } });
    return roomsOf(io);
  };

  it('une story CLOSE ne livre sa traduction qu\'aux Proches et au-dessus, plus l\'auteur', async () => {
    expect(await translate('CLOSE')).toEqual(feeds(CLS, BLD, AUTHOR));
  });

  it('une story BLOOD ne la livre qu\'au Sang et à l\'auteur', async () => {
    expect(await translate('BLOOD')).toEqual(feeds(BLD, AUTHOR));
  });

  it('une story ACQUAINTANCES la livre à tout niveau lié, plus l\'auteur', async () => {
    expect(await translate('ACQUAINTANCES')).toEqual(feeds(ACQ, FRI, CLS, BLD, AUTHOR));
  });
});

describe('l\'atteignabilité d\'un signalement', () => {
  const reach = async (visibility: string, reporter: string) => {
    const prisma = {
      ...graph(),
      post: { findUnique: jest.fn<any>(async () => ({ authorId: AUTHOR, visibility, visibilityUserIds: [], deletedAt: null })) },
    };
    return verifierCible({ prisma: prisma as never, signalant: { userId: reporter }, type: 'post', entityId: POST_ID });
  };

  it('un Proche atteint un post CLOSE ; un Ami ne l\'atteint pas', async () => {
    expect(await reach('CLOSE', CLS)).toEqual({ atteignable: true });
    expect(await reach('CLOSE', FRI)).toEqual({ atteignable: false, raison: 'inaccessible' });
  });

  it('seul le Sang atteint un post BLOOD', async () => {
    expect(await reach('BLOOD', BLD)).toEqual({ atteignable: true });
    expect(await reach('BLOOD', CLS)).toEqual({ atteignable: false, raison: 'inaccessible' });
    expect(await reach('BLOOD', STR)).toEqual({ atteignable: false, raison: 'inaccessible' });
  });

  it('une Connaissance atteint un post ACQUAINTANCES ; un inconnu non', async () => {
    expect(await reach('ACQUAINTANCES', ACQ)).toEqual({ atteignable: true });
    expect(await reach('ACQUAINTANCES', STR)).toEqual({ atteignable: false, raison: 'inaccessible' });
  });
});
