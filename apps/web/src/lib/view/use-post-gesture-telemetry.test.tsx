import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from 'bun:test';

import type { SocialEventV2Input } from '@/lib/api/social-events-v2-types';
import { rememberCard } from '@/lib/telemetry/card-context';
import { closeSendSheet, sendSheetStore } from '@/lib/send/send-sheet-store';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { readingTelemetry } from './reading-telemetry';
import { usePostGesture } from './use-post-gesture';

/**
 * UN GESTE ABOUTI DIT OÙ ET COMMENT (#10502, #10503) — la mutation REST a
 * déjà compté ; l'événement `interaction` dit depuis quel écran, à quelle
 * place, et ce que le Prisme servait.
 */
const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
const POST = '6512bd43d9caa6e02c990b0a';
let v2: SocialEventV2Input[] = [];
const original = readingTelemetry.recordV2;
let container: HTMLDivElement;
let root: Root;

beforeAll(() => {
  ensureHappyDomRegistered();
  globals.IS_REACT_ACT_ENVIRONMENT = true;
});
afterAll(async () => {
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
  await releaseHappyDomIfRegistered();
});
beforeEach(() => {
  v2 = [];
  readingTelemetry.recordV2 = (event) => void v2.push(event);
  rememberCard(POST, {
    targetKind: 'post',
    surface: 'feed',
    listing: { position: 2, rankingSource: 'following' },
    prism: { displayedLanguage: 'fr', originalLanguage: 'en', translated: true, translationSource: 'server' },
    shownAt: Date.now(),
  });
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  closeSendSheet();
  readingTelemetry.recordV2 = original;
});

let hooks: ReturnType<typeof usePostGesture> | null = null;
function Harness() {
  hooks = usePostGesture();
  return null;
}
const mount = () => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => root.render(<Harness />));
};
const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });

describe('usePostGesture — la télémétrie des gestes', () => {
  test('réagir dans le fil émet interaction/react avec la surface, la position et prism.translated', async () => {
    mount();
    act(() => hooks?.onGesture(POST, 'like'));
    await settle();
    expect(v2).toHaveLength(1);
    expect(v2[0]).toMatchObject({
      type: 'interaction',
      action: 'react',
      target: { kind: 'post', id: POST },
      surface: 'feed',
      listing: { position: 2 },
      prism: { translated: true },
    });
  });

  test('un partage PARTI dit sa destination ; l’ouverture de la feuille ne dit rien', () => {
    mount();
    act(() => hooks?.onShare(POST));
    expect(v2).toEqual([]);
    act(() => sendSheetStore.getState().request?.onShared?.('copy_link'));
    expect(v2[0]).toMatchObject({ type: 'interaction', action: 'share', destination: 'copy_link', target: { id: POST } });
  });

  test('ouvrir les commentaires émet comment_open', () => {
    mount();
    act(() => hooks?.onComment(POST));
    expect(v2[0]).toMatchObject({ type: 'interaction', action: 'comment_open', surface: 'feed' });
  });

  test('ouvrir la feuille de signalement émet negative/report_open, sans durée de lecture', () => {
    mount();
    act(() => hooks?.menu.onReportOpen?.(POST));
    expect(v2).toHaveLength(1);
    expect(v2[0]).toMatchObject({ type: 'negative', action: 'report_open', target: { kind: 'post', id: POST }, surface: 'feed' });
    expect('dwellBeforeMs' in (v2[0] ?? {})).toBe(false);
  });
});
