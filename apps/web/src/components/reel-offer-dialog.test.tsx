import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import { loadInterfaceCatalog } from '@/lib/i18n-catalog';
import { createActMounter } from '@/test-support/act-mount';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { ReelOfferDialog } from './reel-offer-dialog';

/**
 * **« PUBLIER EN RÉEL ? »** (#8603) — le modal qu'ouvre un post à une seule
 * vidéo. Trois issues, un effet chacune : « C'est un Réel » (l'action
 * principale, focalisée d'office), « C'est un Post », et Annuler / Échap qui
 * ne publie rien.
 */
const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };

beforeAll(async () => {
  await loadInterfaceCatalog('en');
  ensureHappyDomRegistered();
  globals.IS_REACT_ACT_ENVIRONMENT = true;
});

afterAll(async () => {
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
});

const mounter = createActMounter();
afterEach(() => mounter.unmountAll());

const mountOffer = async (calls: string[], lang: 'fr' | 'en' = 'fr') =>
  mounter.mount(
    <ReelOfferDialog
      lang={lang}
      onReel={() => calls.push('reel')}
      onPost={() => calls.push('post')}
      onCancel={() => calls.push('cancel')}
    />,
  );

describe('ReelOfferDialog — une modale nommée, trois issues', () => {
  test('la modale porte son titre et sa description par leurs identifiants', async () => {
    const host = await mountOffer([]);
    const dialog = host.querySelector<HTMLDialogElement>('dialog[data-reel-offer]');
    expect(dialog).not.toBeNull();
    const titleId = dialog?.getAttribute('aria-labelledby') ?? '';
    const bodyId = dialog?.getAttribute('aria-describedby') ?? '';
    expect(host.querySelector(`[id="${titleId}"]`)?.textContent).toBe('Publier en réel ?');
    expect(host.querySelector(`[id="${bodyId}"]`)?.textContent ?? '').toContain('vidéo');
  });

  test('« C’est un Réel » est l’action principale, focalisée d’office', async () => {
    const host = await mountOffer([]);
    const reel = host.querySelector<HTMLButtonElement>('[data-reel-offer-choice="reel"]');
    expect(reel?.textContent).toBe('C’est un Réel');
    expect(host.ownerDocument.activeElement).toBe(reel);
    const buttons = [...host.querySelectorAll<HTMLButtonElement>('dialog button')];
    expect(buttons[0]).toBe(reel ?? null);
  });

  test('« C’est un Réel » appelle onReel, et seulement lui', async () => {
    const calls: string[] = [];
    const host = await mountOffer(calls);
    host.querySelector<HTMLButtonElement>('[data-reel-offer-choice="reel"]')?.click();
    expect(calls).toEqual(['reel']);
  });

  test('« C’est un Post » appelle onPost, et seulement lui', async () => {
    const calls: string[] = [];
    const host = await mountOffer(calls);
    const post = host.querySelector<HTMLButtonElement>('[data-reel-offer-choice="post"]');
    expect(post?.textContent).toBe('C’est un Post');
    post?.click();
    expect(calls).toEqual(['post']);
  });

  test('Annuler ne publie rien', async () => {
    const calls: string[] = [];
    const host = await mountOffer(calls);
    host.querySelector<HTMLButtonElement>('[data-reel-offer-choice="cancel"]')?.click();
    expect(calls[0]).toBe('cancel');
    expect(calls).not.toContain('reel');
    expect(calls).not.toContain('post');
  });

  test('Échap (l’événement close du dialogue) ne publie rien', async () => {
    const calls: string[] = [];
    const host = await mountOffer(calls);
    host.querySelector('dialog')?.dispatchEvent(new Event('close'));
    expect(calls).toEqual(['cancel']);
  });

  test('les libellés suivent la langue d’interface', async () => {
    const host = await mountOffer([], 'en');
    expect(host.querySelector('[data-reel-offer-choice="reel"]')?.textContent).toBe('It’s a Reel');
    expect(host.querySelector('[data-reel-offer-choice="post"]')?.textContent).toBe('It’s a Post');
    expect(host.querySelector('[data-reel-offer-choice="cancel"]')?.textContent).toBe('Cancel');
  });
});
