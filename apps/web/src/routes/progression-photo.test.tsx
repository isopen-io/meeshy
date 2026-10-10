import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';
import { act, useState } from 'react';

import { resolveEngagementProgress } from '@meeshy/shared/utils/engagement-progress';

import type { EngagementWithGame } from '@/lib/api/engagement';
import { ENGAGEMENT_PROGRESS_FIXTURE } from '@/lib/api/engagement-fixture';
import { gameBlockFixture } from '@/lib/api/game-fixture';
import type { PhotoEnv } from '@/lib/game-photo/env';
import { startMoment, type PhotoMoment } from '@/lib/game-photo/moments';
import type { NotebookEntry } from '@/lib/game-photo/notebook';
import { createActMounter } from '@/test-support/act-mount';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { usePhotoMoments, type PhotoMoments } from './progression-photo';

const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
const { mount, unmountAll } = createActMounter();

beforeAll(() => {
  ensureHappyDomRegistered({ url: 'http://localhost/me/progression' });
  globals.IS_REACT_ACT_ENVIRONMENT = true;
});
afterAll(async () => {
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
});
afterEach(unmountAll);

const view = (patch: Parameters<typeof gameBlockFixture>[0] = {}): EngagementWithGame => ({
  ...resolveEngagementProgress(ENGAGEMENT_PROGRESS_FIXTURE),
  game: gameBlockFixture(patch),
});

const settle = () => act(() => new Promise<void>((resolve) => setTimeout(resolve, 15)));

async function bench(initial: EngagementWithGame | undefined, notebookEntries: readonly Partial<NotebookEntry>[] = []) {
  const env = { notebook: { list: async () => notebookEntries as NotebookEntry[] } } as unknown as PhotoEnv;
  let current: PhotoMoments | null = null;
  let setView: (next: EngagementWithGame | undefined) => void = () => undefined;
  let setSettled: (next: boolean) => void = () => undefined;
  function Probe() {
    const [shown, set] = useState<EngagementWithGame | undefined>(initial);
    const [settled, mark] = useState(true);
    setView = set;
    setSettled = mark;
    current = usePhotoMoments({ view: shown, env: () => env, settled });
    return null;
  }
  await mount(<Probe />);
  return {
    photo: (): PhotoMoments => {
      if (current === null) throw new Error('le crochet n’est pas monté');
      return current;
    },
    show: async (next: EngagementWithGame | undefined) => {
      await act(async () => setView(next));
      await settle();
    },
    pending: async (next: EngagementWithGame) => {
      await act(async () => {
        setSettled(false);
        setView(next);
      });
      await settle();
    },
    confirm: async (next?: EngagementWithGame) => {
      await act(async () => {
        if (next !== undefined) setView(next);
        setSettled(true);
      });
      await settle();
    },
  };
}

const ids = (moments: readonly PhotoMoment[]): string[] => moments.map((m) => m.id);

/**
 * LES PROPOSITIONS DE PHOTO PENDANT QUE L'ÉCRAN EST OUVERT (#9382) — Mee
 * propose APRÈS la célébration : la Flamme qui franchit 7 jours, la dixième
 * Meesh. Jamais à l'ouverture (un état n'est pas une célébration), jamais deux
 * fois le même moment, jamais un moment que le carnet connaît déjà.
 */
describe('à l’ouverture', () => {
  test('aucune proposition : un état n’est pas une célébration', async () => {
    const b = await bench(view({ streak: 7 }));
    expect(b.photo().offers).toEqual([]);
    expect(b.photo().active).toBeNull();
  });
});

describe('une célébration pendant que l’écran est ouvert', () => {
  test('la Flamme franchit 7 jours : Mee propose', async () => {
    const b = await bench(view({ streak: 6 }));
    await b.show(view({ streak: 7 }));
    expect(ids(b.photo().offers)).toEqual(['flame:7']);
  });

  test('un geste encore en vol ne propose rien ; confirmé, il propose', async () => {
    const b = await bench(view({ streak: 6 }));
    await b.pending(view({ streak: 7 }));
    expect(b.photo().offers).toEqual([]);
    await b.confirm();
    expect(ids(b.photo().offers)).toEqual(['flame:7']);
  });

  test('un geste refusé et restauré ne propose rien', async () => {
    const before = view({ streak: 6 });
    const b = await bench(before);
    await b.pending(view({ streak: 7 }));
    await b.confirm(before);
    expect(b.photo().offers).toEqual([]);
  });

  test('la dixième Meesh, quand la première est déjà gardée', async () => {
    const b = await bench(view({ mintedLifetime: 9 }), [{ momentId: 'meesh:1', status: 'kept' }]);
    await b.show(view({ mintedLifetime: 10 }));
    expect(ids(b.photo().offers)).toEqual(['meesh:10']);
  });

  test('le même moment ne se propose pas deux fois dans la séance', async () => {
    const b = await bench(view({ streak: 6 }));
    await b.show(view({ streak: 7 }));
    await b.show(view({ streak: 6 }));
    await b.show(view({ streak: 7 }));
    expect(ids(b.photo().offers)).toEqual(['flame:7']);
  });

  test('un moment que le carnet connaît déjà (gardé ou en attente) ne se repropose pas', async () => {
    const b = await bench(view({ streak: 6 }), [{ momentId: 'flame:7' }]);
    await b.show(view({ streak: 7 }));
    expect(b.photo().offers).toEqual([]);
  });

  test('un ancien serveur : rien', async () => {
    const b = await bench(view({ streak: 6 }));
    await b.show(resolveEngagementProgress(ENGAGEMENT_PROGRESS_FIXTURE));
    expect(b.photo().offers).toEqual([]);
  });
});

/**
 * LE RYTHME (#9961, #9962) — une transition ne propose qu'UN moment, le plus
 * marquant ; une étape qui en saute une autre cède la place à l'étape ouverte
 * de sa piste ; et tant qu'une proposition attend un geste, aucune autre ne
 * s'ajoute.
 */
describe('une seule proposition à la fois', () => {
  test('une transition qui produit plusieurs moments n’en propose qu’un, le plus marquant', async () => {
    const b = await bench(view({ streak: 6, mintedLifetime: 9 }), [{ momentId: 'meesh:1', status: 'kept' }]);
    await b.show(view({ streak: 7, mintedLifetime: 10 }));
    expect(ids(b.photo().offers)).toEqual(['flame:7']);
  });

  test('la dixième Meesh sans la première : c’est la première qui se propose', async () => {
    const b = await bench(view({ mintedLifetime: 9 }));
    await b.show(view({ mintedLifetime: 10 }));
    expect(ids(b.photo().offers)).toEqual(['meesh:1']);
    expect(b.photo().offers[0]?.title).toBe('Ma première Meesh');
  });

  test('l’étape ouverte de la piste, quand elle attend déjà (« plus tard »), ne se repropose pas', async () => {
    const b = await bench(view({ mintedLifetime: 9 }), [{ momentId: 'meesh:1', status: 'pending' }]);
    await b.show(view({ mintedLifetime: 10 }));
    expect(b.photo().offers).toEqual([]);
  });

  test('une proposition qui attend un geste : aucune autre ne s’ajoute', async () => {
    const b = await bench(view({ streak: 6, mintedLifetime: 9 }), [{ momentId: 'meesh:1', status: 'kept' }]);
    await b.show(view({ streak: 7, mintedLifetime: 9 }));
    await b.show(view({ streak: 7, mintedLifetime: 10 }));
    expect(ids(b.photo().offers)).toEqual(['flame:7']);
  });
});

describe('les gestes', () => {
  test('« Photographier » ouvre le déroulé du moment, et retire la proposition', async () => {
    const b = await bench(view({ streak: 6 }));
    await b.show(view({ streak: 7 }));
    const [offer] = b.photo().offers;
    if (offer === undefined) throw new Error('proposition attendue');
    await act(async () => b.photo().start(offer));
    expect(b.photo().active?.id).toBe('flame:7');
    expect(b.photo().offers).toEqual([]);
  });

  test('ouvrir le déroulé d’un moment qui ne vient pas d’une proposition (le départ, une carte du guide)', async () => {
    const b = await bench(view());
    await act(async () => b.photo().start(startMoment()));
    expect(b.photo().active?.id).toBe('start');
  });

  test('« Plus tard » retire la proposition sans ouvrir', async () => {
    const b = await bench(view({ streak: 6 }));
    await b.show(view({ streak: 7 }));
    await act(async () => b.photo().dismiss('flame:7'));
    expect(b.photo().offers).toEqual([]);
    expect(b.photo().active).toBeNull();
  });

  test('fermer le déroulé le rend', async () => {
    const b = await bench(view());
    await act(async () => b.photo().start(startMoment()));
    await act(async () => b.photo().close());
    expect(b.photo().active).toBeNull();
  });
});
