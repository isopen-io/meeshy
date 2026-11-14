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
import type { TalkieCaptureFactory, TalkieVoiceCopy } from '@/lib/talkie/talkie-sender';
import { createActMounter } from '@/test-support/act-mount';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { ProfileTalkieRow, ProfileTalkieRowView } from './user-profile-talkie';

/**
 * PARLER EN TALKIE DEPUIS LA FICHE D'UN PROCHE (#16641) — le bouton existe dès
 * Proche, là où le navigateur encode l'AAC ; on maintient, on parle, on relâche.
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

const link = (effectiveLevel: RelationLink['effectiveLevel']): RelationLink => ({
  userId: PROCHE,
  effectiveLevel,
  grantedByMe: effectiveLevel,
  since: null,
  progress: { activeWeeks: 3, needed: 4, missing: [] },
  eligibleFor: null,
});

const view = (props: { readonly supported?: boolean; readonly phase?: 'idle' | 'starting' | 'talking'; readonly waking?: boolean } = {}) =>
  renderToStaticMarkup(
    <ProfileTalkieRowView language="fr" name="Ada" supported={props.supported ?? true} phase={props.phase ?? 'idle'} waking={props.waking ?? false} onPress={noop} onRelease={noop} />,
  );

describe('ProfileTalkieRowView', () => {
  test('au repos : « Maintenir pour parler », nommé pour le lecteur d’écran avec le geste clavier', () => {
    const html = view();
    expect(html).toContain('Maintenir pour parler');
    expect(html).toContain('aria-label="Maintenir pour parler à Ada — au clavier, gardez Espace enfoncé"');
    expect(html).toContain('aria-pressed="false"');
  });

  test('pendant la prise de parole : « Vous parlez à Ada… », annoncé', () => {
    const html = view({ phase: 'talking' });
    expect(html).toContain('Vous parlez à Ada…');
    expect(html).toContain('role="status"');
    expect(html).toContain('aria-pressed="true"');
  });

  test('un destinataire réveillé par push : « Réveil de Ada… » (#17144)', () => {
    const html = view({ phase: 'talking', waking: true });
    expect(html).toContain('Réveil de Ada…');
    expect(html).not.toContain('Vous parlez à Ada…');
  });

  test('le (i) est un bouton de 48 px, nommé et fermé au repos', () => {
    const html = view();
    expect(html).toContain('data-talkie-info=""');
    expect(html).toContain('aria-label="À propos du talkie d’urgence"');
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain('width:48px;height:48px');
    expect(html).not.toContain('extrême urgence');
  });

  test('navigateur sans AAC : AUCUN bouton, le message vocal est proposé', () => {
    const html = view({ supported: false });
    expect(html).not.toContain('data-talkie-send');
    expect(html).toContain('envoyez plutôt un message vocal');
  });
});

function harness(ack: unknown) {
  const emitted: Array<{ readonly event: string; readonly payload: unknown }> = [];
  const socket: SocketClient = {
    connected: true,
    connect: noop,
    disconnect: noop,
    on: noop,
    off: noop,
    emit: (event, payload) => {
      emitted.push({ event, payload });
    },
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
  const notices: string[] = [];
  const tones: boolean[] = [];
  const row = (
    <ProfileTalkieRow
      language="fr"
      person={{ id: PROCHE, username: 'ada', displayName: 'Ada', avatar: null }}
      onNotice={(message, failed) => {
        notices.push(message);
        tones.push(failed);
      }}
      deps={{ source: 'gateway', transport }}
      watch={watch}
      capture={capture}
      supported={async () => true}
      copier={async (copy) => {
        copies.push(copy);
        return true;
      }}
    />
  );
  return { row, emitted, notices, tones, copies };
}

const settle = async () => {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
};

const press = async (node: HTMLElement) => {
  const button = node.querySelector<HTMLButtonElement>('[data-talkie-send]');
  await act(async () => {
    button?.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));
  });
  await settle();
  await settle();
};

const release = async (node: HTMLElement) => {
  const button = node.querySelector<HTMLButtonElement>('[data-talkie-send]');
  await act(async () => {
    button?.dispatchEvent(new KeyboardEvent('keyup', { key: ' ', bubbles: true }));
  });
  await settle();
  await settle();
};

describe('ProfileTalkieRow', () => {
  test('absent sous Proche : un Ami n’a pas le talkie', async () => {
    appQueryClient.setQueryData(RELATION_LINKS_QUERY_KEY, [link('FRIEND')]);
    const { row } = harness({ success: true });
    const node = await mount(row);
    await settle();
    expect(node.querySelector('[data-talkie-send]')).toBeNull();
  });

  test('dès Proche : maintenir Espace ouvre talkie:start vers ce Proche', async () => {
    appQueryClient.setQueryData(RELATION_LINKS_QUERY_KEY, [link('CLOSE')]);
    const { row, emitted } = harness({ success: true, data: { talkieId: 'a'.repeat(24), maxDurationMs: 30_000, maxChunkBytes: 16_384 } });
    const node = await mount(row);
    await settle();
    expect(node.querySelector('[data-talkie-send]')).not.toBeNull();
    await press(node);
    expect(emitted[0]).toEqual({ event: TALKIE_CLIENT_EVENTS.TALKIE_START, payload: { toUserId: PROCHE, codec: 'aac-adts' } });
    expect(node.textContent).toContain('Vous parlez à Ada…');
  });

  test('TALKIE_NOT_ALLOWED retire le bouton, sans rien dire', async () => {
    appQueryClient.setQueryData(RELATION_LINKS_QUERY_KEY, [link('BLOOD')]);
    const { row, notices } = harness({ success: false, error: 'x', code: 'TALKIE_NOT_ALLOWED' });
    const node = await mount(row);
    await settle();
    await press(node);
    expect(node.querySelector('[data-talkie-send]')).toBeNull();
    expect(notices).toEqual([]);
  });

  test('un blocage se dit comme un repli : la voix s’enregistre, part en message vocal, et l’issue est une INFORMATION', async () => {
    appQueryClient.setQueryData(RELATION_LINKS_QUERY_KEY, [link('CLOSE')]);
    const { row, notices, tones, copies } = harness({ success: false, error: 'x', code: 'TALKIE_BLOCKED' });
    const node = await mount(row);
    await settle();
    await press(node);
    expect(node.textContent).toContain('Le talkie ne passe pas : votre voix part en message vocal');
    expect(notices).toEqual([]);
    await release(node);
    expect(copies).toHaveLength(1);
    expect(copies[0]?.toUserId).toBe(PROCHE);
    expect(notices).toEqual(['L’utilisateur n’est pas disponible pour un accès d’urgence. Un message sera créé et envoyé dans votre conversation la plus récente avec lui.']);
    expect(tones).toEqual([false]);
    expect(node.querySelector('[data-talkie-send]')).not.toBeNull();
  });

  test('le (i) s’ouvre au toucher et dit à qui le talkie est destiné', async () => {
    appQueryClient.setQueryData(RELATION_LINKS_QUERY_KEY, [link('CLOSE')]);
    const { row } = harness({ success: true, data: { talkieId: 'a'.repeat(24), maxDurationMs: 30_000, maxChunkBytes: 16_384 } });
    const node = await mount(row);
    await settle();
    const info = node.querySelector<HTMLButtonElement>('[data-talkie-info]');
    await act(async () => {
      info?.click();
    });
    expect(info?.getAttribute('aria-expanded')).toBe('true');
    expect(node.querySelector('[data-talkie-info-text]')?.textContent).toBe(
      'Disponible pour vos très proches. À utiliser en cas d’extrême urgence : votre voix sort chez eux même si Meeshy est en arrière-plan.',
    );
  });
});
