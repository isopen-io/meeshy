import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import { loadInterfaceCatalog, translate } from '@/lib/i18n-catalog';
import { createActMounter } from '@/test-support/act-mount';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { PostRepostConfirm } from './post-repost-confirm';

/**
 * `PostRepostConfirm` (revue-correction #6278, défaut majeur 1) — LE SEUL
 * chemin vers `confirmRepost` : sans demande en attente, rien ne se monte ;
 * avec une demande, « Repartager » confirme, « Annuler » referme — jamais
 * l'inverse, jamais les deux à la fois.
 */
const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };

beforeAll(async () => {
  ensureHappyDomRegistered();
  globals.IS_REACT_ACT_ENVIRONMENT = true;
  await loadInterfaceCatalog('fr');
});

afterAll(async () => {
  document.documentElement.lang = 'fr';
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
});

const mounter = createActMounter();
afterEach(() => mounter.unmountAll());

describe('PostRepostConfirm — rien sans demande, une modale nommée avec', () => {
  test('`pendingRepostId` nul ⇒ rien ne se monte', async () => {
    const host = await mounter.mount(
      <PostRepostConfirm pendingRepostId={null} onConfirm={() => undefined} onCancel={() => undefined} />,
    );
    expect(host.querySelector('dialog')).toBeNull();
  });

  test('une demande en attente monte la modale, nommée dans la langue d’interface', async () => {
    document.documentElement.lang = 'fr';
    const host = await mounter.mount(
      <PostRepostConfirm pendingRepostId="p1" onConfirm={() => undefined} onCancel={() => undefined} />,
    );
    const dialog = host.querySelector('dialog[data-confirm-dialog="post-repost"]');
    expect(dialog).not.toBeNull();
    const titleId = dialog?.getAttribute('aria-labelledby') ?? '';
    expect(host.querySelector(`[id="${titleId}"]`)?.textContent).toBe(translate('fr', 'feed.post.repost.confirm.title'));
  });

  test('« Repartager » appelle `onConfirm`, et SEULEMENT lui', async () => {
    const calls: string[] = [];
    const host = await mounter.mount(
      <PostRepostConfirm
        pendingRepostId="p1"
        onConfirm={() => calls.push('confirm')}
        onCancel={() => calls.push('cancel')}
      />,
    );
    host.querySelector<HTMLButtonElement>('[data-confirm="confirm"]')?.click();
    expect(calls).toEqual(['confirm']);
  });

  test('« Annuler » appelle `onCancel`, et SEULEMENT lui', async () => {
    const calls: string[] = [];
    const host = await mounter.mount(
      <PostRepostConfirm
        pendingRepostId="p1"
        onConfirm={() => calls.push('confirm')}
        onCancel={() => calls.push('cancel')}
      />,
    );
    host.querySelector<HTMLButtonElement>('[data-confirm="cancel"]')?.click();
    expect(calls).toEqual(['cancel']);
  });
});
