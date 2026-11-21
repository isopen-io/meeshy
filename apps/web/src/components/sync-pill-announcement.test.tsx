import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';
import { act } from 'react';

import { createPillAnnouncementStore, type PillAnnouncement, type PillAnnouncementStoreApi } from '@/lib/view/sync-pill-announcements';
import { createActMounter } from '@/test-support/act-mount';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { PillAnnouncementBody, useShownPillAnnouncement } from './sync-pill-announcement';

/**
 * LA PASTILLE FAIT DÉFILER SES ANNONCES, PUIS DISPARAÎT (#14147) — chaque annonce parle son temps puis cède ; une
 * pastille qui dit plus urgent (un envoi échoué) retient l'annonce sans la dire.
 */

const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
const { mount, unmountAll } = createActMounter();

beforeAll(() => {
  ensureHappyDomRegistered();
  globals.IS_REACT_ACT_ENVIRONMENT = true;
});

afterAll(async () => {
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
});

afterEach(() => unmountAll());

const said = (overrides: Partial<PillAnnouncement> = {}): PillAnnouncement => ({
  id: 'a1',
  key: 'battery:ada',
  text: 'Ada : batterie critique (4 %)',
  tone: 'alert',
  icon: { kind: 'battery', level: 4, charging: false },
  at: Date.now(),
  ...overrides,
});

function Probe({ store, suppressed }: { readonly store: PillAnnouncementStoreApi; readonly suppressed: boolean }) {
  const shown = useShownPillAnnouncement({ store, suppressed });
  return shown === null ? <p data-probe="none" /> : <PillAnnouncementBody announcement={shown} />;
}

const wait = (ms: number) => act(async () => new Promise((resolve) => setTimeout(resolve, ms)));

describe('le défilement', () => {
  test('l’annonce se dit, avec sa batterie dessinée, puis la file se vide', async () => {
    const store = createPillAnnouncementStore();
    store.getState().announce(said());
    const host = await mount(<Probe store={store} suppressed={false} />);
    expect(host.querySelector('[data-sync-pill="announcement"]')?.textContent).toBe('Ada : batterie critique (4 %)');
    expect(host.querySelector('[data-battery-glyph]')).not.toBeNull();
    await act(async () => store.getState().retire('a1'));
    expect(host.querySelector('[data-probe="none"]')).not.toBeNull();
  });

  test('le téléphone injoignable d’un proche se dit avec un téléphone barré, son retour avec un téléphone entier (#18737)', async () => {
    const store = createPillAnnouncementStore();
    store.getState().announce(said({ key: 'phone:ada', text: 'Ada a un téléphone injoignable depuis 14:10', icon: { kind: 'phone', reachable: false } }));
    const host = await mount(<Probe store={store} suppressed={false} />);
    expect(host.querySelector('[data-phone-glyph="unreachable"]')).not.toBeNull();
    expect(host.querySelector('[data-battery-glyph]')).toBeNull();
    await act(async () => store.getState().announce(said({ id: 'a2', key: 'phone:ada', text: 'Ada est de nouveau joignable', tone: 'good', icon: { kind: 'phone', reachable: true } })));
    expect(host.querySelector('[data-phone-glyph="reachable"]')).not.toBeNull();
  });

  test('l’alerte d’inactivité d’un Sang se dit avec un sablier, son retour avec une coche (#18738)', async () => {
    const store = createPillAnnouncementStore();
    store.getState().announce(said({ key: 'inactivity:jacques', text: 'Jacques n’a pas répondu à « Tout va bien ? »', icon: { kind: 'inactivity', responded: false } }));
    const host = await mount(<Probe store={store} suppressed={false} />);
    expect(host.querySelector('[data-inactivity-glyph="alert"]')).not.toBeNull();
    expect(host.querySelector('[data-battery-glyph]')).toBeNull();
    await act(async () => store.getState().announce(said({ id: 'a2', key: 'inactivity:jacques', text: 'Jacques va bien', tone: 'good', icon: { kind: 'inactivity', responded: true } })));
    expect(host.querySelector('[data-inactivity-glyph="responded"]')).not.toBeNull();
  });

  test('« en appel » se dit avec un combiné, la fin avec un combiné raccroché (#18753)', async () => {
    const store = createPillAnnouncementStore();
    store.getState().announce(said({ key: 'call:jacques', text: 'Jacques est en appel', tone: 'good', icon: { kind: 'call', active: true } }));
    const host = await mount(<Probe store={store} suppressed={false} />);
    expect(host.querySelector('[data-call-glyph="active"]')).not.toBeNull();
    expect(host.querySelector('[data-battery-glyph]')).toBeNull();
    await act(async () => store.getState().announce(said({ id: 'a2', key: 'call:jacques', text: 'Jacques a raccroché', tone: 'good', icon: { kind: 'call', active: false } })));
    expect(host.querySelector('[data-call-glyph="ended"]')).not.toBeNull();
  });

  test('une chute détectée se dit avec une silhouette, le retour avec une coche (#18748)', async () => {
    const store = createPillAnnouncementStore();
    store.getState().announce(said({ key: 'fall:awa', text: 'Une chute a été détectée sur la montre de Awa', icon: { kind: 'fall', responded: false } }));
    const host = await mount(<Probe store={store} suppressed={false} />);
    expect(host.querySelector('[data-fall-glyph="detected"]')).not.toBeNull();
    expect(host.querySelector('[data-battery-glyph]')).toBeNull();
    await act(async () => store.getState().announce(said({ id: 'a2', key: 'fall:awa', text: 'Awa va bien', tone: 'good', icon: { kind: 'fall', responded: true } })));
    expect(host.querySelector('[data-fall-glyph="responded"]')).not.toBeNull();
  });

  test('retenue tant que la pastille dit plus urgent', async () => {
    const store = createPillAnnouncementStore();
    store.getState().announce(said());
    const host = await mount(<Probe store={store} suppressed />);
    expect(host.querySelector('[data-sync-pill="announcement"]')).toBeNull();
    expect(store.getState().queue).toHaveLength(1);
  });

  test('une annonce périmée quitte la file sans être dite', async () => {
    const store = createPillAnnouncementStore();
    store.getState().announce(said({ at: Date.now() - 60_000 }));
    const host = await mount(<Probe store={store} suppressed={false} />);
    await wait(0);
    expect(host.querySelector('[data-sync-pill="announcement"]')).toBeNull();
    expect(store.getState().queue).toEqual([]);
  });
});
