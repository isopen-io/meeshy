import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import { createActMounter } from '@/test-support/act-mount';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';
import type { ChoreographyKind } from '@/lib/game/choreography';
import type { PlayHandle } from '@/lib/game/play';

import { useChoreography } from './use-choreography';

const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };

beforeAll(() => {
  ensureHappyDomRegistered({ url: 'http://localhost/game' });
  globals.IS_REACT_ACT_ENVIRONMENT = true;
});

afterAll(async () => {
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
});

const mounter = createActMounter();
afterEach(() => mounter.unmountAll());

type Probe = { play: ((kind: ChoreographyKind) => PlayHandle | null) | null };

function Host({ probe }: { readonly probe: Probe }) {
  const { ref, play } = useChoreography<HTMLDivElement>({ reducedMotion: false, haptics: false });
  probe.play = play;
  return (
    <div ref={ref} data-testid="root">
      <i data-game-shield="" />
    </div>
  );
}

const animatable = (el: Element): { animations: { cancelled: boolean }[] } => {
  const record = { animations: [] as { cancelled: boolean }[] };
  Object.assign(el, {
    animate: () => {
      const animation = { cancelled: false };
      record.animations.push(animation);
      return { finished: Promise.resolve(), cancel: () => void (animation.cancelled = true) };
    },
  });
  return record;
};

describe('useChoreography', () => {
  test('play() joue le plan sur l’élément de la ref', async () => {
    const probe: Probe = { play: null };
    const host = await mounter.mount(<Host probe={probe} />);
    const shield = host.querySelector('[data-game-shield]');
    const record = animatable(shield as Element);
    const handle = probe.play?.('rank');
    expect(handle).not.toBeNull();
    expect(record.animations.length).toBeGreaterThan(0);
  });

  test('sans élément derrière la ref, play() rend null et ne lève pas', async () => {
    const probe: Probe = { play: null };
    function Orphan() {
      const { play } = useChoreography<HTMLDivElement>();
      probe.play = play;
      return <div />;
    }
    await mounter.mount(<Orphan />);
    expect(probe.play?.('rank')).toBeNull();
  });

  test('rejouer annule le geste en cours : jamais deux chorégraphies sur le même objet', async () => {
    const probe: Probe = { play: null };
    const host = await mounter.mount(<Host probe={probe} />);
    const record = animatable(host.querySelector('[data-game-shield]') as Element);
    probe.play?.('rank');
    const first = [...record.animations];
    probe.play?.('rank');
    expect(first.every((a) => a.cancelled)).toBe(true);
  });

  test('le démontage annule le geste en cours', async () => {
    const probe: Probe = { play: null };
    const host = await mounter.mount(<Host probe={probe} />);
    const record = animatable(host.querySelector('[data-game-shield]') as Element);
    probe.play?.('rank');
    mounter.unmountAll();
    expect(record.animations.every((a) => a.cancelled)).toBe(true);
  });
});
