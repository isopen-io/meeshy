import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import type { ApiResult } from '@/lib/api/http';
import { loadSendSheetCatalog } from '@/lib/i18n-send-sheet-catalog';
import type { SendSheetPorts } from '@/lib/send/send-sheet-run';
import { buttonNamed, createActMounter } from '@/test-support/act-mount';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { SendSheet } from './send-sheet';

/**
 * LA FEUILLE D'ENVOI DANS LA COQUE ANDROID (#9023) — sa plateforme PAR DÉFAUT
 * se compose comme le portail des invitations : `navigator.share`, sinon le
 * pont `MeeshyShare` (la WebView n'a pas l'API Web Share) ; la copie a le
 * repli `execCommand` quand `writeText` refuse.
 */

const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean; Capacitor?: unknown };

beforeAll(async () => {
  ensureHappyDomRegistered();
  globals.IS_REACT_ACT_ENVIRONMENT = true;
  await loadSendSheetCatalog('fr');
});

afterAll(async () => {
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
});

const mounter = createActMounter();
afterEach(() => {
  mounter.unmountAll();
  Reflect.deleteProperty(globalThis, 'Capacitor');
  Reflect.deleteProperty(navigator, 'share');
  Reflect.deleteProperty(navigator, 'clipboard');
  Reflect.deleteProperty(document, 'execCommand');
});

const URL_PARTAGEE = 'https://meeshy.me/feeds/post/p1';

const refused = <T,>(): Promise<ApiResult<T>> => Promise.resolve({ ok: false, status: 500, error: 'inutilisé' });

const ports: SendSheetPorts = {
  online: () => true,
  openDirect: refused,
  forward: async () => ({ ok: false, status: 500, error: 'inutilisé' }),
  sendMessage: refused,
  uploadFiles: refused,
  fetchFile: async () => null,
  uploadMedia: refused,
  publishMedia: refused,
  publishFromAttachment: refused,
  repost: refused,
  createTextPost: refused,
  newClientMessageId: () => 'cid-1',
};

type NativeCall = { readonly plugin: string; readonly method: string; readonly options: unknown };

function androidShell(): NativeCall[] {
  const calls: NativeCall[] = [];
  Object.defineProperty(navigator, 'share', { value: undefined, configurable: true });
  globals.Capacitor = {
    getPlatform: () => 'android',
    PluginHeaders: [{ name: 'MeeshyShare', methods: [{ name: 'share' }, { name: 'shareFile' }] }],
    nativePromise: (plugin: string, method: string, options: unknown) => {
      calls.push({ plugin, method, options });
      return Promise.resolve({});
    },
  };
  return calls;
}

const mount = () =>
  mounter.mount(
    <SendSheet
      request={{ payload: { kind: 'text', text: 'Regarde ça', url: URL_PARTAGEE }, intent: 'share', moreOptions: { url: URL_PARTAGEE } }}
      viewerId="u-moi"
      language="fr"
      contentLanguage="fr"
      ports={ports}
      useDirectory={() => ({ conversations: [], friends: [], searchResults: undefined, loading: false })}
      onClose={() => {}}
    />,
  );

describe('SendSheet dans la coque Android (#9023)', () => {
  test('« Plus d’options… » ouvre la feuille de partage d’Android par le pont MeeshyShare', async () => {
    const calls = androidShell();
    const host = await mount();
    await mounter.click(buttonNamed(host, 'Plus d’options…'));
    expect(calls.map(({ plugin, method }) => `${plugin}.${method}`)).toEqual(['MeeshyShare.share']);
    expect(JSON.stringify(calls[0]?.options).includes(URL_PARTAGEE)).toBe(true);
  });

  test('« Copier le lien » : le presse-papiers refuse, le repli copie ⇒ « Lien copié »', async () => {
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: () => Promise.reject(new DOMException('refusé', 'NotAllowedError')) },
      configurable: true,
    });
    const copied: string[] = [];
    Object.defineProperty(document, 'execCommand', {
      value: () => {
        const field = document.querySelector<HTMLTextAreaElement>('textarea[aria-hidden="true"]');
        if (field !== null) copied.push(field.value);
        return field !== null;
      },
      configurable: true,
    });
    const host = await mount();
    await mounter.click(buttonNamed(host, 'Copier le lien'));
    await mounter.settle();
    expect(copied).toEqual([URL_PARTAGEE]);
    expect(host.querySelector('[role="status"]')?.textContent).toBe('Lien copié');
  });
});
