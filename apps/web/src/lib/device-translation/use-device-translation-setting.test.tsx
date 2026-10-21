import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import { createActMounter } from '@/test-support/act-mount';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import type { DeviceTranslationConsent } from './consent';
import { useDeviceTranslationSetting } from './use-device-translation-setting';

const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
const { mount, unmountAll, settle, click } = createActMounter();

beforeAll(() => {
  ensureHappyDomRegistered({ url: 'http://localhost/' });
  globals.IS_REACT_ACT_ENVIRONMENT = true;
});
afterEach(() => unmountAll());
afterAll(async () => {
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
});

/** Un consentement de témoin : ce qu'il tient, et ce qu'on lui a demandé. */
const consentHeldBy = (initial: boolean, options: { readonly refuses?: boolean } = {}) => {
  const calls: string[] = [];
  let value = initial;
  const consent: DeviceTranslationConsent = {
    granted: () => value,
    grant: () => {
      calls.push('grant');
      if (options.refuses !== true) value = true;
    },
    revoke: () => {
      calls.push('revoke');
      value = false;
    },
  };
  return { calls, load: async () => consent };
};

function Probe({ load }: { readonly load: Parameters<typeof useDeviceTranslationSetting>[0] }) {
  const toggle = useDeviceTranslationSetting(load);
  return <button type="button" data-ready={String(toggle.ready)} data-enabled={String(toggle.enabled)} onClick={() => toggle.onToggle(!toggle.enabled)} />;
}

const state = (host: HTMLElement): string => {
  const button = host.querySelector('button');
  return `${button?.getAttribute('data-ready')}/${button?.getAttribute('data-enabled')}`;
};

describe('useDeviceTranslationSetting — l’accord de l’appareil, lu et posé à la demande (#9898)', () => {
  test('pas prêt tant que l’accord n’est pas lu ; puis il dit ce que l’appareil tient', async () => {
    const held = consentHeldBy(true);
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const host = await mount(
      <Probe
        load={async () => {
          await gate;
          return held.load();
        }}
      />,
    );
    expect(state(host)).toBe('false/false');
    release();
    await settle();
    expect(state(host)).toBe('true/true');
  });

  test('sans accord, la bascule est prête et éteinte', async () => {
    const host = await mount(<Probe load={consentHeldBy(false).load} />);
    expect(state(host)).toBe('true/false');
  });

  test('l’allumer pose l’accord ; l’éteindre le retire', async () => {
    const held = consentHeldBy(false);
    const host = await mount(<Probe load={held.load} />);
    await click(host.querySelector('button'));
    expect(state(host)).toBe('true/true');
    await click(host.querySelector('button'));
    expect(state(host)).toBe('true/false');
    expect(held.calls).toEqual(['grant', 'revoke']);
  });

  test('un stockage qui refuse l’accord : la bascule revient à ce que l’appareil tient vraiment', async () => {
    const held = consentHeldBy(false, { refuses: true });
    const host = await mount(<Probe load={held.load} />);
    await click(host.querySelector('button'));
    expect(state(host)).toBe('true/false');
  });

  test('un module qui ne se charge pas laisse la bascule posée mais inerte, sans rien remonter', async () => {
    const host = await mount(
      <Probe
        load={async () => {
          throw new Error('chunk introuvable');
        }}
      />,
    );
    expect(state(host)).toBe('false/false');
  });

  test('un écran quitté avant la lecture ne change plus d’état', async () => {
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const held = consentHeldBy(true);
    await mount(
      <Probe
        load={async () => {
          await gate;
          return held.load();
        }}
      />,
    );
    unmountAll();
    release();
    await settle();
  });
});
