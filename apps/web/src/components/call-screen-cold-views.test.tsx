import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';

import type { ActiveCall, CallMember } from '@/lib/calls/call-store';
import { loadCallControlsCatalog } from '@/lib/i18n-call-controls-catalog';
import { loadPillMotion } from '@/lib/calls/use-pill-motion';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { ActiveCallView } from './call-overlay';
import { CallScreen, loadColdCallViews } from './call-screen';

/**
 * LE CODE FROID DE L'ÉCRAN D'APPEL VIT HORS DE `call_overlay` (#17650) — la
 * réponse à un appel entrant et la grille d'un groupe se chargent à part, et ne
 * perdent rien : l'état qui les annonce les précharge, et une fois là elles se
 * dessinent dans le MÊME rendu que l'écran, jamais un demi-écran.
 */

const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };

beforeAll(async () => {
  await loadPillMotion();
  await loadCallControlsCatalog('fr');
  ensureHappyDomRegistered();
  globals.IS_REACT_ACT_ENVIRONMENT = true;
});

afterAll(async () => {
  await act(async () => {});
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
});

const member = (overrides: Partial<CallMember> = {}): CallMember => ({
  userId: 'u-a',
  name: 'Awa',
  avatar: null,
  micMuted: false,
  cameraOn: false,
  screenSharing: false,
  weakNetwork: false,
  capturing: false,
  link: 'connected',
  ...overrides,
});

const call = (overrides: Partial<ActiveCall> = {}): ActiveCall => ({
  callId: 'call-cold',
  conversationId: 'c-1',
  media: 'audio',
  direction: 'outgoing',
  isGroup: false,
  title: 'Famille',
  avatar: null,
  callerName: null,
  phase: { kind: 'connected' },
  connectedAt: 0,
  endedDurationSec: null,
  micMuted: false,
  cameraOn: false,
  facing: 'user',
  screenSharing: false,
  members: {},
  display: 'full',
  localStream: null,
  remoteStreams: {},
  captions: [],
  captionsMode: 'off',
  captionPeers: [],
  preview: null,
  previewed: false,
  transcription: 'idle',
  initiatorId: null,
  invitedBy: null,
  quality: null,
  ...overrides,
});

const SRC = resolve(import.meta.dirname, '..');

const stripComments = (source: string): string => source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

const resolveImport = (from: string, specifier: string): string | null => {
  const base = specifier.startsWith('@/') ? join(SRC, specifier.slice(2)) : specifier.startsWith('.') ? resolve(dirname(from), specifier) : null;
  if (base === null) return null;
  return [`${base}.ts`, `${base}.tsx`, join(base, 'index.ts'), join(base, 'index.tsx')].find((candidate) => existsSync(candidate)) ?? null;
};

/** Ce que l'écran d'appel atteint par ses imports STATIQUES, de proche en proche : ce que `call_overlay` emporte. Un `import()` n'est pas suivi, un `import type` non plus. */
function reachable(entry: string): readonly string[] {
  const seen = new Set<string>();
  const queue = [entry];
  while (queue.length > 0) {
    const file = queue.pop();
    if (file === undefined || seen.has(file)) continue;
    seen.add(file);
    for (const match of stripComments(readFileSync(file, 'utf8')).matchAll(/(?:^|\n)\s*(?:import|export)\s[^;]*?from\s+'([^']+)'/g)) {
      if (/^\s*(?:import|export)\s+type\s/.test(match[0].trim())) continue;
      const target = resolveImport(file, match[1] ?? '');
      if (target !== null) queue.push(target);
    }
  }
  return [...seen].map((file) => relative(SRC, file));
}

/**
 * CE QUI NE VIT QU'APRÈS UN GESTE OU DANS UN ÉTAT RARE, HORS DE `call_overlay` (#17930) — la grille d'un groupe et
 * l'écran partagé à sa une, la sonnerie et la fin, la vignette du coin et ses gestes (pincer, glisser, les flèches, la
 * loi du glissé), l'écran qu'un pair partage en duo et son zoom, les bandeaux du haut : chacun dans son chunk, que
 * l'écran précharge.
 */
const COLD_VIEWS = [
  'components/call-grid.tsx',
  'components/call-grid-screen.tsx',
  'components/call-ring-and-end.ts',
  'components/call-duo-corner.tsx',
  'components/use-tile-pinch.ts',
  'components/use-tile-drag.ts',
  'lib/calls/call-self-tile-gestures.ts',
  'components/call-screen-zoom-surface.tsx',
  'components/use-screen-zoom.ts',
  'components/call-share-banner.tsx',
] as const;

const camera = { kind: 'video', readyState: 'live', getCapabilities: () => ({}), getSettings: () => ({}), applyConstraints: async () => undefined };
const liveVideo = (): MediaStream => Object.assign(Object.create(MediaStream.prototype) as MediaStream, { getVideoTracks: () => [camera], getAudioTracks: () => [], getTracks: () => [camera] });

const group = { isGroup: true, members: { 'u-a': member(), 'u-b': member({ userId: 'u-b', name: 'Bintou' }) } } as const;

describe('le code froid de l’écran d’appel', () => {
  test('l’écran d’appel n’atteint aucune vue froide par un import statique : elles ne pèsent pas sur call_overlay', () => {
    const reached = new Set(reachable(join(SRC, 'components/call-overlay.tsx')));
    expect(COLD_VIEWS.filter((view) => reached.has(view))).toEqual([]);
  });

  test('un duo qui sonne encore précharge l’écran qu’un pair partagera : connecté, il est là au premier rendu, plein écran compris', async () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    act(() => root.render(<CallScreen call={call({ media: 'video', phase: { kind: 'outgoing' } })} />));
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
    const sharing = renderToStaticMarkup(<CallScreen call={call({ media: 'video', members: { 'u-a': member({ screenSharing: true }) }, remoteStreams: { 'u-a': liveVideo() } })} />);
    expect(sharing).toContain('data-call-shared-screen=""');
    expect(sharing).toContain('data-call-screen-surface=""');
    expect(sharing).toContain('data-call-fullscreen=""');
    act(() => root.unmount());
    host.remove();
  });

  test('un appel de groupe qui sonne encore précharge sa grille : connecté, elle est là au premier rendu', async () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    act(() => root.render(<CallScreen call={call({ ...group, phase: { kind: 'outgoing' } })} />));
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
    expect(renderToStaticMarkup(<CallScreen call={call(group)} />)).toContain('data-call-tile="u-b"');
    act(() => root.unmount());
    host.remove();
  });

  test('préchargés, la réponse d’un appel entrant et la grille se dessinent dans le même rendu que l’écran', async () => {
    await loadColdCallViews();
    const ringing = renderToStaticMarkup(<CallScreen call={call({ phase: { kind: 'incoming' }, direction: 'incoming', media: 'video', callerName: 'Awa' })} />);
    expect(ringing).toContain('data-call-incoming-accept');
    expect(ringing).toContain('data-call-incoming-audio-only');
    expect(ringing).toContain('data-call-incoming-decline');
    expect(renderToStaticMarkup(<CallScreen call={call(group)} />)).toContain('data-call-tile-self');
  });

  test('un appel entrant se montre entier — portrait ET réponses — jamais l’un sans l’autre', async () => {
    await loadColdCallViews();
    const html = renderToStaticMarkup(<ActiveCallView call={call({ phase: { kind: 'incoming' }, direction: 'incoming', callerName: 'Awa' })} />);
    expect(html).toContain('data-call-incoming-portrait');
    expect(html).toContain('data-call-incoming-accept');
  });
});
