import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import type { Attachment } from '@/lib/api/types';
import { CAPTURE_SHIELD_PLUGIN } from '@/lib/capture/capture-shield';
import { VIEW_ONCE_AWAY_ATTRIBUTE } from '@/lib/capture/use-capture-shield';
import type { CoqueNative } from '@/lib/native-shell';
import { createActMounter } from '@/test-support/act-mount';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { ProtectedContent } from './protected-content';

/**
 * LA VUE UNIQUE NE S'AFFICHE QUE SOUS BOUCLIER (#9574, décision porteur du
 * 2026-10-07). Dans la coque Android, le contenu ne se peint qu'une fois
 * `FLAG_SECURE` posé ; une coque sans pont ne l'affiche pas du tout (fermé par
 * défaut) et n'offre même pas de l'ouvrir. Le navigateur, qui ne peut rien
 * noircir, l'affiche — et le masque quand la fenêtre perd le focus.
 */
const globals = globalThis as typeof globalThis & {
  IS_REACT_ACT_ENVIRONMENT?: boolean;
  Capacitor?: CoqueNative;
  IntersectionObserver?: typeof IntersectionObserver;
};

class InertIntersectionObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords(): IntersectionObserverEntry[] {
    return [];
  }
  readonly root = null;
  readonly rootMargin = '';
  readonly thresholds = [];
}

let nativeObserver: typeof IntersectionObserver | undefined;

beforeAll(() => {
  ensureHappyDomRegistered();
  globals.IS_REACT_ACT_ENVIRONMENT = true;
  nativeObserver = globals.IntersectionObserver;
  globals.IntersectionObserver = InertIntersectionObserver as unknown as typeof IntersectionObserver;
});

afterAll(async () => {
  if (nativeObserver === undefined) delete globals.IntersectionObserver;
  else globals.IntersectionObserver = nativeObserver;
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
});

const mounter = createActMounter();
afterEach(() => {
  mounter.unmountAll();
  delete globals.Capacitor;
  document.documentElement.removeAttribute(VIEW_ONCE_AWAY_ATTRIBUTE);
});

type Bridge = { readonly calls: { readonly secure: boolean }[]; readonly settle: () => void };

function installShell(methods: readonly string[]): Bridge {
  const calls: { secure: boolean }[] = [];
  const pending: (() => void)[] = [];
  globals.Capacitor = {
    getPlatform: () => 'android',
    PluginHeaders: [{ name: CAPTURE_SHIELD_PLUGIN, methods: methods.map((name) => ({ name })) }],
    nativePromise: (_plugin, _method, options) => {
      calls.push(options as { secure: boolean });
      return new Promise<unknown>((resolve) => pending.push(() => resolve({})));
    },
  };
  return { calls, settle: () => pending.splice(0).forEach((resolve) => resolve()) };
}

const consumed: string[] = [];

const mountViewOnce = (attachments: readonly Attachment[] = []) =>
  mounter.mount(
    <ProtectedContent
      messageId="m-vu"
      kind="viewOnce"
      isViewOnce
      contentLength={12}
      attachments={attachments}
      surface="bubble"
      onConsumeViewOnce={async (id) => {
        consumed.push(id);
        return true;
      }}
    >
      <p data-secret>SECRET-VU</p>
    </ProtectedContent>,
  );

describe('la vue unique dans la coque Android', () => {
  test('le contenu ne se peint qu’après FLAG_SECURE, qui tombe quand il n’est plus affiché', async () => {
    const bridge = installShell(['setSecure', 'getState']);
    const host = await mountViewOnce();
    await mounter.click(host.querySelector('[data-view-once-chip="sealed"]'));
    expect(bridge.calls).toEqual([{ secure: true }]);
    expect(document.body.innerHTML).not.toContain('SECRET-VU');

    bridge.settle();
    await mounter.settle();
    expect(document.body.innerHTML).toContain('SECRET-VU');

    await mounter.click(host.querySelector('[data-view-once-open]'));
    await new Promise((resolve) => setTimeout(resolve, 600));
    await mounter.settle();
    expect(document.body.innerHTML).not.toContain('SECRET-VU');
    expect(bridge.calls).toEqual([{ secure: true }, { secure: false }]);
  });

  test('un pont qui refuse de poser FLAG_SECURE : rien ne se peint, le bouclier réessaie et montre au succès', async () => {
    const calls: { secure: boolean }[] = [];
    globals.Capacitor = {
      getPlatform: () => 'android',
      PluginHeaders: [{ name: CAPTURE_SHIELD_PLUGIN, methods: [{ name: 'setSecure' }, { name: 'getState' }] }],
      nativePromise: (_plugin, method, options) => {
        if (method !== 'setSecure') return Promise.resolve({});
        calls.push(options as { secure: boolean });
        return calls.filter((call) => call.secure).length === 1 && (options as { secure: boolean }).secure
          ? Promise.reject(new Error('activité indisponible'))
          : Promise.resolve({});
      },
    };
    const host = await mountViewOnce();
    await mounter.click(host.querySelector('[data-view-once-chip="sealed"]'));
    await mounter.settle();
    expect(document.body.innerHTML).not.toContain('SECRET-VU');
    await new Promise((resolve) => setTimeout(resolve, 1_100));
    await mounter.settle();
    expect(document.body.innerHTML).toContain('SECRET-VU');
    expect(calls.filter((call) => call.secure)).toHaveLength(2);
  });

  test('une coque sans pont n’offre pas d’ouvrir la vue unique et n’en consomme rien', async () => {
    consumed.length = 0;
    installShell([]);
    const host = await mountViewOnce();
    expect(host.querySelector('[data-view-once-chip="sealed"]')).toBeNull();
    expect(host.querySelector('[data-protection-notice="withheld"]')).not.toBeNull();
    expect(document.body.innerHTML).not.toContain('SECRET-VU');
    expect(consumed).toEqual([]);
  });
});

describe('la vue unique dans un navigateur', () => {
  test('elle s’affiche sans pont, et se masque quand la fenêtre perd le focus', async () => {
    const host = await mountViewOnce();
    await mounter.click(host.querySelector('[data-view-once-chip="sealed"]'));
    await mounter.settle();
    expect(document.body.innerHTML).toContain('SECRET-VU');
    expect(document.documentElement.hasAttribute(VIEW_ONCE_AWAY_ATTRIBUTE)).toBe(false);

    window.dispatchEvent(new Event('blur'));
    expect(document.documentElement.hasAttribute(VIEW_ONCE_AWAY_ATTRIBUTE)).toBe(true);
    window.dispatchEvent(new Event('focus'));
    expect(document.documentElement.hasAttribute(VIEW_ONCE_AWAY_ATTRIBUTE)).toBe(false);
  });

  test('le masque ne reste pas posé une fois la vue unique refermée', async () => {
    const host = await mountViewOnce();
    await mounter.click(host.querySelector('[data-view-once-chip="sealed"]'));
    window.dispatchEvent(new Event('blur'));
    mounter.unmountAll();
    expect(document.documentElement.hasAttribute(VIEW_ONCE_AWAY_ATTRIBUTE)).toBe(false);
    expect(host.isConnected).toBe(false);
  });
});
