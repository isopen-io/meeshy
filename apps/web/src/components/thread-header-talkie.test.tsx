import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';
import { act } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { TALKIE_CLIENT_EVENTS } from '@meeshy/shared/types/socketio-events/talkie-event-names';

import type { HttpTransport } from '@/lib/api/http';
import { appQueryClient } from '@/lib/api/query-client';
import { RELATION_LINKS_QUERY_KEY, type RelationLink } from '@/lib/api/relations';
import type { WatchRealtime } from '@/lib/api/watch-realtime';
import { loadCirclesCatalog } from '@/lib/i18n-circles-catalog';
import type { SocketClient } from '@/lib/net/socket';
import { createTalkieLevelMeter } from '@/lib/talkie/talkie-header-law';
import { createTalkieStore } from '@/lib/talkie/talkie-live';
import type { TalkieCaptureFactory, TalkieVoiceCopy } from '@/lib/talkie/talkie-sender';
import { createActMounter } from '@/test-support/act-mount';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { TalkieHeaderBand, talkieAnnouncement, ThreadHeaderTalkie, type ThreadTalkieLive } from './thread-header-talkie';

/**
 * LE TALKIE DANS L'EN-TÊTE D'UN DIRECT (#17338, jumelle de #17337) — proposé dès
 * Proche ; une voix qui part ou arrive prend toute la barre, et la barre dit
 * AVANT la fin si la voix passe en direct ou part hors ligne.
 */

const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
const { mount, unmountAll } = createActMounter();

beforeAll(async () => {
  ensureHappyDomRegistered();
  globals.IS_REACT_ACT_ENVIRONMENT = true;
  await loadCirclesCatalog('fr');
});

afterAll(async () => {
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
});

afterEach(() => {
  unmountAll();
  appQueryClient.clear();
});

const PROCHE = '64b000000000000000000001';
const noop = () => undefined;
const OPENED = { success: true, data: { talkieId: 'a'.repeat(24), maxDurationMs: 30_000, maxChunkBytes: 16_384 } };

const link = (effectiveLevel: RelationLink['effectiveLevel']): RelationLink => ({
  userId: PROCHE,
  effectiveLevel,
  grantedByMe: effectiveLevel,
  since: null,
  progress: { activeWeeks: 3, needed: 4, missing: [] },
  eligibleFor: null,
});

function harness(ack: unknown, { supported = true }: { readonly supported?: boolean } = {}) {
  const emitted: Array<{ readonly event: string; readonly payload: unknown }> = [];
  const socket: SocketClient = {
    connected: true,
    connect: noop,
    disconnect: noop,
    on: noop,
    off: noop,
    emit: (event, payload) => void emitted.push({ event, payload }),
    emitWithAck: async (event, payload) => {
      emitted.push({ event, payload });
      return ack;
    },
  };
  const watch: WatchRealtime = (watcher) => watcher(socket);
  const capture: TalkieCaptureFactory = async ({ onFrame }) => {
    onFrame(new Uint8Array([0xff, 0xf1, 7]), 21);
    return { stop: async () => undefined };
  };
  const copies: TalkieVoiceCopy[] = [];
  const transport = (async () => ({ ok: true, data: null })) as unknown as HttpTransport;
  transport.request = (async () => ({ ok: true, data: appQueryClient.getQueryData(RELATION_LINKS_QUERY_KEY) ?? [] })) as HttpTransport['request'];
  const lives: ThreadTalkieLive[] = [];
  const store = createTalkieStore();
  const slot = (
    <ThreadHeaderTalkie
      language="fr"
      peerId={PROCHE}
      peerName="Ada"
      secondary="#8b5cf6"
      onLive={(live) => void lives.push(live)}
      deps={{ source: 'gateway', transport }}
      watch={watch}
      capture={capture}
      supported={async () => supported}
      store={store}
      copier={async (copy) => {
        copies.push(copy);
        return true;
      }}
    />
  );
  return { slot, emitted, lives, store, copies };
}

const settle = async () => {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
};

const hold = async (node: HTMLElement) => {
  await act(async () => {
    node.querySelector('[data-thread-talkie]')?.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));
  });
  await settle();
  await settle();
};

describe('le bouton talkie de l’en-tête', () => {
  test('dès Proche, nommé pour le lecteur d’écran avec le geste clavier, et sans (i)', async () => {
    appQueryClient.setQueryData(RELATION_LINKS_QUERY_KEY, [link('CLOSE')]);
    const node = await mount(harness(OPENED).slot);
    await settle();
    const button = node.querySelector('[data-thread-talkie]');
    expect(button?.getAttribute('aria-label')).toBe('Maintenir pour parler à Ada — au clavier, gardez Espace enfoncé');
    expect(node.querySelector('[data-talkie-info]')).toBeNull();
  });

  test('absent sous Proche, et là où le navigateur n’encode pas l’AAC', async () => {
    appQueryClient.setQueryData(RELATION_LINKS_QUERY_KEY, [link('FRIEND')]);
    const friend = await mount(harness(OPENED).slot);
    await settle();
    expect(friend.querySelector('[data-thread-talkie]')).toBeNull();
    unmountAll();
    appQueryClient.setQueryData(RELATION_LINKS_QUERY_KEY, [link('BLOOD')]);
    const unsupported = await mount(harness(OPENED, { supported: false }).slot);
    await settle();
    expect(unsupported.querySelector('[data-thread-talkie]')).toBeNull();
  });

  test('maintenir ouvre talkie:start vers le pair, et la voix qui part prend la barre en direct', async () => {
    appQueryClient.setQueryData(RELATION_LINKS_QUERY_KEY, [link('CLOSE')]);
    const { slot, emitted, lives } = harness(OPENED);
    const node = await mount(slot);
    await settle();
    await hold(node);
    expect(emitted[0]).toEqual({ event: TALKIE_CLIENT_EVENTS.TALKIE_START, payload: { toUserId: PROCHE, codec: 'aac-adts' } });
    expect(lives.at(-1)).toEqual({ voice: 'outgoing', delivery: 'live' });
    expect(node.querySelector('[data-thread-talkie]')?.getAttribute('aria-pressed')).toBe('true');
  });

  test('un pair hors ligne qu’on réveille : la barre dit « hors ligne » avant la fin, et le réveil se dit', async () => {
    appQueryClient.setQueryData(RELATION_LINKS_QUERY_KEY, [link('CLOSE')]);
    const { slot, lives } = harness({ success: true, data: { ...OPENED.data, delivery: 'waking' } });
    const node = await mount(slot);
    await settle();
    await hold(node);
    expect(lives.at(-1)).toEqual({ voice: 'outgoing', delivery: 'relayed' });
    expect(document.body.textContent).toContain('Réveil de Ada…');
  });

  test('ma voix qui part s’annonce au lecteur d’écran au changement de mode ; la voix qui arrive, non', async () => {
    appQueryClient.setQueryData(RELATION_LINKS_QUERY_KEY, [link('CLOSE')]);
    const { slot, store } = harness({ success: true, data: { ...OPENED.data, delivery: 'waking' } });
    const node = await mount(slot);
    await settle();
    const region = () => node.querySelector('[data-thread-talkie-announce]')?.textContent ?? null;
    expect(region()).toBe('');
    await act(async () => {
      store.getState().open({ talkieId: 't9', fromUserId: PROCHE, codec: 'aac-adts', startedAt: new Date().toISOString(), maxDurationMs: 30_000 });
    });
    expect(region()).toBe('');
    await hold(node);
    expect(region()).toBe('Hors ligne : votre voix lui sera rejouée à son retour');
  });

  test('TALKIE_NOT_ALLOWED retire le bouton, sans rien dire', async () => {
    appQueryClient.setQueryData(RELATION_LINKS_QUERY_KEY, [link('CLOSE')]);
    const node = await mount(harness({ success: false, error: 'x', code: 'TALKIE_NOT_ALLOWED' }).slot);
    await settle();
    await hold(node);
    expect(node.querySelector('[data-thread-talkie]')).toBeNull();
    expect(document.querySelector('[data-thread-talkie-notice]')).toBeNull();
  });

  test('un repli enregistre la voix (« Enregistré »), l’envoie en message vocal au relâcher, et se dit comme une information', async () => {
    appQueryClient.setQueryData(RELATION_LINKS_QUERY_KEY, [link('CLOSE')]);
    const { slot, lives, copies } = harness({ success: false, error: 'x', code: 'TALKIE_FALLBACK_VOICE' });
    const node = await mount(slot);
    await settle();
    await hold(node);
    expect(lives.at(-1)).toEqual({ voice: 'outgoing', delivery: 'recorded' });
    await act(async () => {
      node.querySelector('[data-thread-talkie]')?.dispatchEvent(new KeyboardEvent('keyup', { key: ' ', bubbles: true }));
    });
    await settle();
    await settle();
    expect(copies).toHaveLength(1);
    expect(document.querySelector('[data-thread-talkie-notice]')?.textContent).toContain('n’est pas disponible pour un accès d’urgence');
  });

  test('la voix du pair qui arrive prend la barre, même quand le talkie ne m’est pas proposé', async () => {
    appQueryClient.setQueryData(RELATION_LINKS_QUERY_KEY, [link('FRIEND')]);
    const { slot, lives, store } = harness(OPENED);
    await mount(slot);
    await settle();
    await act(async () => {
      store.getState().open({ talkieId: 't1', fromUserId: PROCHE, codec: 'aac-adts', startedAt: new Date().toISOString(), maxDurationMs: 30_000 });
    });
    expect(lives.at(-1)).toEqual({ voice: 'incoming', delivery: 'live' });
    await act(async () => {
      store.getState().close('t1');
    });
    expect(lives.at(-1)).toEqual({ voice: 'none', delivery: 'live' });
  });
});

const band = (live: ThreadTalkieLive) =>
  renderToStaticMarkup(<TalkieHeaderBand language="fr" live={live} accent="#6366f1" secondary="#8b5cf6" meter={createTalkieLevelMeter()} />);

describe('la barre élargie', () => {
  test('en direct : pastille « En direct », spectre miroir, chrono, dégradé de la conversation, liseré plein', () => {
    const html = band({ voice: 'outgoing', delivery: 'live' });
    expect(html).toContain('En direct');
    expect(html).toContain('data-talkie-wave="mirror"');
    expect(html).toContain('0:00');
    expect(html).toContain('linear-gradient(to right, #6366f1, #8b5cf6)');
    expect(html).toContain('data-talkie-delivery="live"');
    expect(html).not.toContain('dashed');
    expect(html).not.toContain('data-talkie-playhead');
  });

  test('hors ligne : « Hors ligne », bande vers une tête de lecture rouge, fond assombri, liseré pointillé', () => {
    const html = band({ voice: 'outgoing', delivery: 'relayed' });
    expect(html).toContain('Hors ligne');
    expect(html).toContain('data-talkie-wave="tape"');
    expect(html).toContain('data-talkie-playhead');
    expect(html).toContain('var(--color-scrim-soft)');
    expect(html).toContain('dashed');
  });

  test('le repli en message vocal : « Enregistré »', () => {
    expect(band({ voice: 'outgoing', delivery: 'recorded' })).toContain('Enregistré');
  });

  test('les annonces des trois modes', () => {
    expect(talkieAnnouncement('fr', { voice: 'outgoing', delivery: 'live' })).toBe('Talkie en direct : votre voix est entendue maintenant');
    expect(talkieAnnouncement('fr', { voice: 'outgoing', delivery: 'relayed' })).toBe('Hors ligne : votre voix lui sera rejouée à son retour');
    expect(talkieAnnouncement('fr', { voice: 'outgoing', delivery: 'recorded' })).toBe('Le talkie ne passe pas : votre voix part en message vocal');
    expect(talkieAnnouncement('fr', { voice: 'incoming', delivery: 'live' })).toBe('');
  });

  test('elle ne prend aucun geste : le pointeur qui tient le bouton dessous reste le sien', () => {
    expect(band({ voice: 'incoming', delivery: 'live' })).toContain('pointer-events-none');
  });
});
