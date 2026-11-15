import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';

import type { ActiveCall, CallMember } from '@/lib/calls/call-store';
import { loadPillMotion } from '@/lib/calls/use-pill-motion';
import { loadCallControlsCatalog } from '@/lib/i18n-call-controls-catalog';
import { loadCallStudioCatalog } from '@/lib/i18n-call-studio-catalog';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { CallScreen, loadColdCallViews } from './call-screen';

/**
 * #17946 (décision porteur du 2026-11-13) — EN MODE EFFETS OU MONTAGE, LE VERRE DES SOUS-TITRES N'A PAS
 * DE « JOURNAL » : la pilule n'est plus là, la barre est `‹ · Réglages · (+)`, et le journal n'aurait
 * nulle part où s'ouvrir. Son pied garde « EN → FR · toucher = original » (P8, P8b, C1 ; iOS :
 * `CallView+Mode.swift`, `captionsBand(hasOwnGlass: true, opensJournal: false)`). Hors mode, la pilule
 * garde son bouton « Journal » (#17346).
 */

const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };

const member = (): CallMember => ({ userId: 'u-awa', name: 'Awa', avatar: null, micMuted: false, cameraOn: true, screenSharing: false, weakNetwork: false, capturing: false, link: 'connected' });

const said = (n: number) => ({ id: `w-${n}`, speakerId: 'u-awa', speakerName: 'Awa', original: `Line ${n}`, translated: `Ligne ${n}`, pair: { from: 'en', to: 'fr' }, isFinal: true, at: n, mine: false });

const call = (overrides: Partial<ActiveCall> = {}): ActiveCall => ({
  callId: 'call-mode-captions',
  conversationId: 'c-1',
  media: 'video',
  direction: 'outgoing',
  isGroup: false,
  title: 'Awa',
  avatar: null,
  callerName: null,
  phase: { kind: 'connected' },
  connectedAt: 0,
  endedDurationSec: null,
  micMuted: false,
  cameraOn: true,
  facing: 'user',
  screenSharing: false,
  members: { 'u-awa': member() },
  display: 'full',
  localStream: null,
  remoteStreams: {},
  captions: [said(1), said(2)],
  captionsMode: 'translated',
  captionPeers: [],
  preview: null,
  previewed: false,
  transcription: 'idle',
  initiatorId: null,
  invitedBy: null,
  quality: null,
  ...overrides,
});

beforeAll(async () => {
  await loadPillMotion();
  await loadCallControlsCatalog('fr');
  await loadCallStudioCatalog('fr');
  await loadColdCallViews();
  renderToStaticMarkup(<CallScreen call={call()} canShare initiallyExpanded />);
  await import('./call-control-actions');
  await import('./call-rails');
  await import('./call-captions-panel');
  await import('./call-effects-mode');
  await import('./call-montage-mode');
  await new Promise((resolve) => setTimeout(resolve, 0));
  renderToStaticMarkup(<CallScreen call={call()} canShare initiallyExpanded />);
  await new Promise((resolve) => setTimeout(resolve, 0));
  ensureHappyDomRegistered();
  globals.IS_REACT_ACT_ENVIRONMENT = true;
});

afterAll(async () => {
  await act(async () => new Promise((resolve) => setTimeout(resolve, 400)));
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
});

const mount = () => {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  act(() => root.render(<CallScreen call={call()} canShare effectsSupport={{ color: true, blur: true }} wide={false} />));
  const find = (selector: string) => [...host.querySelectorAll<HTMLElement>(selector)].find((node) => node.closest('[data-call-pill-ghost], [data-leaving]') === null) ?? null;
  const settle = async () => {
    await act(async () => {});
    await act(async () => new Promise((resolve) => setTimeout(resolve, 0)));
    await act(async () => {});
  };
  return {
    find,
    settle,
    press: (selector: string) => act(() => find(selector)?.click()),
    frame: () => act(async () => void (await new Promise((resolve) => requestAnimationFrame(() => resolve(null))))),
    done: () => {
      act(() => root.unmount());
      host.remove();
    },
  };
};

type View = ReturnType<typeof mount>;

const enter = async (view: View, control: 'effects' | 'capture') => {
  await view.settle();
  view.press('[data-call-more]');
  await view.frame();
  await view.settle();
  view.press(`[data-call-control="${control}"]`);
  await view.settle();
  await view.settle();
};

const band = (view: View) => view.find('[data-call-captions-band] [data-call-captions-panel]');

describe('#17946 — en mode, le verre des sous-titres n’a pas de « Journal »', () => {
  test('hors mode, les sous-titres de la pilule portent « Journal » (#17346)', async () => {
    const view = mount();
    await view.settle();
    expect(view.find('[data-call-control-pill] [data-call-captions-journal]')).not.toBeNull();
    view.done();
  });

  for (const [mode, control] of [
    ['effects', 'effects'],
    ['montage', 'capture'],
  ] as const) {
    test(`${mode} : les sous-titres restent dans leur verre, sans « Journal », et le pied dit « EN → FR · toucher = original »`, async () => {
      const view = mount();
      await enter(view, control);
      expect(view.find(`[data-call-mode="${mode}"]`)).not.toBeNull();
      const glass = band(view);
      expect(glass).not.toBeNull();
      expect(glass?.getAttribute('data-call-captions-surface')).toBe('glass');
      expect(glass?.querySelector('[data-call-captions-journal]')).toBeNull();
      expect(view.find('[data-call-captions-journal]')).toBeNull();
      const footer = glass?.querySelector('[data-call-captions-footer-state="touchForOriginal"]');
      expect(footer?.getAttribute('data-call-captions-pair')).not.toBeNull();
      expect(footer?.textContent).toContain('EN → FR');
      view.done();
    });
  }
});
