import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from 'bun:test';

import { apiDeps } from '@/lib/api/deps';
import { sessionStore } from '@/lib/api/session';
import type { SocialEvent } from '@/lib/api/social-events';
import { STATUS_MOODS_QUERY_KEY, type StatusMoodPost } from '@/lib/api/stories';
import { resolveViewer } from '@/lib/api/viewer';
import { loadInterfaceCatalog } from '@/lib/i18n-catalog';
import { readingTelemetry } from '@/lib/view/reading-telemetry';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { MoodPeekSheet } from './mood-peek-sheet';

/**
 * **OUVRIR UNE HUMEUR DEPUIS UN AVATAR COMPTE SA VUE** (#10530) — miroir de
 * `StatusBubbleController.show` (iOS, #10483) : pour l'humeur d'un AUTRE, une
 * vue à l'ouverture, puis sa durée et la séance `STATUS` à la fermeture, dites
 * depuis `mood_avatar`. L'impression est l'affaire de la pastille, à son
 * apparition : la feuille n'en ajoute pas. Ma propre humeur ne compte rien.
 * Tout passe par la porte existante, `readingTelemetry.record`.
 */
const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };

const me = (): string => resolveViewer({ source: apiDeps.source, session: sessionStore.getState().session }).id ?? '';

let recorded: SocialEvent[] = [];
const originalRecord = readingTelemetry.record;
let mounted: { readonly container: HTMLDivElement; readonly root: Root } | null = null;

beforeAll(async () => {
  ensureHappyDomRegistered();
  globals.IS_REACT_ACT_ENVIRONMENT = true;
  await loadInterfaceCatalog('fr');
});

afterAll(async () => {
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
});

beforeEach(() => {
  recorded = [];
  readingTelemetry.record = (event: SocialEvent) => {
    recorded.push(event);
  };
});

const unmount = (): void => {
  act(() => mounted?.root.unmount());
  mounted?.container.remove();
  mounted = null;
};

afterEach(() => {
  unmount();
  readingTelemetry.record = originalRecord;
});

function open(posts: readonly StatusMoodPost[], authorId: string): void {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  client.setQueryData(STATUS_MOODS_QUERY_KEY, posts);
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  mounted = { container, root };
  act(() =>
    root.render(
      <QueryClientProvider client={client}>
        <MoodPeekSheet peek={{ authorId, emoji: '🎉', name: 'Nour' }} onClose={() => undefined} />
      </QueryClientProvider>,
    ),
  );
}

describe('la feuille d’humeur compte ce qu’elle montre', () => {
  test('l’humeur d’un autre : la vue à l’ouverture, sa durée et la séance à la fermeture', () => {
    open([{ id: 'st-nour', authorId: 'u-nour', moodEmoji: '🎉', content: 'On fête ça' }], 'u-nour');

    expect(recorded).toEqual([{ type: 'view', postId: 'st-nour', surface: 'mood_avatar' }]);

    unmount();
    const closing = recorded.slice(1);

    expect(closing[0]).toMatchObject({ type: 'view', postId: 'st-nour', surface: 'mood_avatar' });
    expect(typeof (closing[0] as { durationMs?: number }).durationMs).toBe('number');
    expect(closing[1]).toMatchObject({ type: 'dwell', postId: 'st-nour', contentType: 'STATUS', surface: 'mood_avatar', completed: false });
    expect(closing).toHaveLength(2);
  });

  test('chaque ouverture compte : rouvrir la même humeur est une seconde vue', () => {
    const posts: readonly StatusMoodPost[] = [{ id: 'st-nour', authorId: 'u-nour', moodEmoji: '🎉' }];
    open(posts, 'u-nour');
    unmount();
    open(posts, 'u-nour');

    expect(recorded.filter((event) => event.type === 'view' && event.durationMs === undefined)).toHaveLength(2);
  });

  test('ma propre humeur : rien ne part, ni à l’ouverture ni à la fermeture', () => {
    expect(me()).not.toBe('');
    open([{ id: 'st-moi', authorId: me(), moodEmoji: '🎉' }], me());
    unmount();

    expect(recorded).toEqual([]);
  });

  test('un auteur absent du corpus : aucun post à compter, rien ne part', () => {
    open([{ id: 'st-nour', authorId: 'u-nour', moodEmoji: '🎉' }], 'u-zed');
    unmount();

    expect(recorded).toEqual([]);
  });
});
