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

async function sendComment(): Promise<void> {
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
  const host = container;
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
});
