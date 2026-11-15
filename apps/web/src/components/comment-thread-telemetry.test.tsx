import { QueryClientProvider } from '@tanstack/react-query';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from 'bun:test';

import { apiDeps } from '@/lib/api/deps';
import { resetFixtureCommentsForTests } from '@/lib/api/fixtures-comments';
import { appQueryClient } from '@/lib/api/query-client';
import { sessionStore } from '@/lib/api/session';
import type { SocialEventV2Input } from '@/lib/api/social-events-v2-types';
import { resolveViewer } from '@/lib/api/viewer';
import { commentDrafts } from '@/lib/comments/comment-draft';
import { unsentComments } from '@/lib/comments/unsent-comments';
import { loadInterfaceCatalog } from '@/lib/i18n-catalog';
import { rememberCard } from '@/lib/telemetry/card-context';
import { readingTelemetry } from '@/lib/view/reading-telemetry';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { CommentThread } from './comment-thread';

/**
 * **UN COMMENTAIRE POSÉ DIT DEPUIS QUELLE PUBLICATION ET QUEL ÉCRAN**
 * (#10502) — `comment_submit` part APRÈS la création confirmée, jamais le
 * texte. Un commentaire seulement gardé (hors ligne, non confirmé) n'a pas
 * encore abouti : la garde est celle de `onGesture`, `notice === undefined`.
 */
const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
const POST = 'post-text-rank2';
const TEXT = 'Superbe coucher de soleil';

let container: HTMLDivElement | null = null;
let root: Root | null = null;
let v2: SocialEventV2Input[] = [];
const original = readingTelemetry.recordV2;
const keepHere = (event: Event) => event.preventDefault();
const scope = () => `u_${resolveViewer({ source: apiDeps.source, session: sessionStore.getState().session }).id ?? ''}`;

beforeAll(async () => {
  ensureHappyDomRegistered();
  globals.IS_REACT_ACT_ENVIRONMENT = true;
  await loadInterfaceCatalog('fr');
});
afterAll(async () => {
  await act(async () => {});
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
});
beforeEach(() => {
  v2 = [];
  readingTelemetry.recordV2 = (event) => void v2.push(event);
  rememberCard(POST, { targetKind: 'post', surface: 'feed', shownAt: Date.now() });
  commentDrafts.set(scope(), POST, { text: '', pending: [] });
  unsentComments.getState().forgetScope(scope());
});
afterEach(() => {
  readingTelemetry.recordV2 = original;
  act(() => root?.unmount());
  container?.remove();
  root = null;
  appQueryClient.clear();
  resetFixtureCommentsForTests();
  unsentComments.getState().forgetScope(scope());
  commentDrafts.set(scope(), POST, { text: '', pending: [] });
});

const settle = () => act(async () => { await new Promise((resolve) => setTimeout(resolve, 30)); });
async function until(predicate: () => boolean): Promise<void> {
  for (let tour = 0; tour < 100 && !predicate(); tour += 1) await settle();
}

async function mountThread(): Promise<HTMLDivElement> {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root?.render(
      <QueryClientProvider client={appQueryClient}>
        <CommentThread postId={POST} />
      </QueryClientProvider>,
    );
  });
  await settle();
  return container;
}

async function sendComment(): Promise<void> {
  const host = await mountThread();
  await act(async () => {
    const field = host.querySelector<HTMLTextAreaElement>('[data-comment-field]');
    if (field === null) throw new Error('champ absent');
    field.value = TEXT;
    field.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await act(async () => host.querySelector<HTMLFormElement>('[data-comment-composer]')?.requestSubmit());
}

describe('CommentThread — comment_submit', () => {
  test('un commentaire créé émet interaction/comment_submit sur la publication, sans son texte', async () => {
    await sendComment();
    await until(() => v2.length > 0);
    expect(v2).toHaveLength(1);
    expect(v2[0]).toMatchObject({ type: 'interaction', action: 'comment_submit', target: { kind: 'post', id: POST }, surface: 'feed' });
    expect(JSON.stringify(v2)).not.toContain('coucher');
  });

  test('toucher l’auteur d’un commentaire émet profile_tap sur CE commentaire, rattaché à sa publication', async () => {
    const host = await mountThread();
    await until(() => host.querySelector('[data-comment-row="cm-r2-1"]') !== null);
    window.addEventListener('click', keepHere, true);
    await act(async () => host.querySelector<HTMLElement>('[data-comment-row="cm-r2-1"] a.avatar-profile-link')?.click());
    window.removeEventListener('click', keepHere, true);
    expect(v2).toHaveLength(1);
    expect(v2[0]).toMatchObject({
      type: 'interaction',
      action: 'profile_tap',
      target: { kind: 'comment', id: 'cm-r2-1', parent: { kind: 'post', id: POST } },
      surface: 'feed',
    });
    expect(JSON.stringify(v2)).not.toContain('ines');
  });

  test('signaler un commentaire émet negative/report_submit sur CE commentaire, avec le code du motif', async () => {
    const host = await mountThread();
    await until(() => host.querySelector('[data-comment-row="cm-r2-1"]') !== null);
    await act(async () => host.querySelector<HTMLButtonElement>('[data-comment-row="cm-r2-1"] [data-comment-gesture="more"]')?.click());
    await act(async () => document.querySelector<HTMLButtonElement>('[data-comment-menu] [data-comment-gesture="report"]')?.click());
    await act(async () => document.querySelector<HTMLButtonElement>('[data-report-reason="spam"]')?.click());
    await until(() => v2.length > 0);
    expect(v2).toHaveLength(1);
    expect(v2[0]).toMatchObject({
      type: 'negative',
      action: 'report_submit',
      reasonCode: 'spam',
      target: { kind: 'comment', id: 'cm-r2-1', parent: { kind: 'post', id: POST } },
      surface: 'feed',
    });
  });
});
