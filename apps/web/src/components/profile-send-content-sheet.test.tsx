import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import { authorPostsQueryKey } from '@/lib/api/author-posts';
import type { FeedPost } from '@/lib/api/feed-pages';
import { appQueryClient } from '@/lib/api/query-client';
import { STORY_TRAY_QUERY_KEY, type StoryTrayPost } from '@/lib/api/stories';
import { loadCirclesCatalog } from '@/lib/i18n-circles-catalog';
import type { SendContentOutcome } from '@/lib/profile/send-content';
import type { SendQueue, StoredSendJob } from '@/lib/send/send-queue';
import type { SendRun, SendSheetPorts, TargetStatus } from '@/lib/send/send-sheet-run';
import { createActMounter } from '@/test-support/act-mount';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { ProfileSendContentSheet } from './profile-send-content-sheet';

/**
 * « LUI ENVOYER UN CONTENU » (#20245) — la feuille ouverte depuis la fiche d'un Proche : mes contenus en
 * grille depuis le cache, un toucher choisit, « Envoyer à Léo » part vers notre conversation directe.
 */

const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
const { mount, unmountAll, click } = createActMounter();

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

const ME = '64b0000000000000000000a1';
const LEO = { id: '64b0000000000000000000b2', name: 'Léo' };
const now = new Date().toISOString();

const post = (id: string, overrides: Partial<FeedPost> = {}): FeedPost => ({
  id,
  type: 'POST',
  createdAt: now,
  author: { id: ME, username: 'moi', displayName: 'Moi' },
  content: `Texte ${id}`,
  ...overrides,
});

const seed = (posts: readonly FeedPost[], stories: readonly StoryTrayPost[] = []) => {
  appQueryClient.setQueryData(authorPostsQueryKey(ME), {
    pages: [{ posts, pagination: { limit: 20, hasMore: false, nextCursor: null } }],
    pageParams: [undefined],
  });
  appQueryClient.setQueryData(STORY_TRAY_QUERY_KEY, stories);
};

const fakeQueue = (status: TargetStatus) => {
  const jobs: Omit<StoredSendJob, 'id' | 'createdAt' | 'snapshot'>[] = [];
  const queue: SendQueue = {
    submit: (job) => {
      jobs.push(job);
      const key = job.entries[0]?.key ?? '';
      const run: SendRun = {
        getState: () => ({ phase: 'done', order: [key], statuses: { [key]: status } }),
        subscribe: () => () => undefined,
        start: async () => undefined,
        retry: async () => undefined,
        retryFailed: async () => undefined,
        snapshot: () => ({ statuses: {}, completed: {}, clientIds: {}, conversations: {}, uploads: {}, media: {} }),
      };
      return { id: 'job-1', viewerId: job.viewerId, run, labels: job.labels };
    },
    resume: async () => undefined,
    flush: async () => undefined,
    forget: async () => undefined,
    jobs: () => [],
    subscribe: () => () => undefined,
  };
  return { queue, jobs };
};

const render = async (queue: SendQueue) => {
  const outcomes: { outcome: SendContentOutcome; message: string }[] = [];
  let closed = 0;
  const host = await mount(
    <ProfileSendContentSheet
      language="fr"
      person={LEO}
      viewerId={ME}
      contentLanguage="fr"
      readerLanguages={['fr']}
      onClose={() => {
        closed += 1;
      }}
      onOutcome={(outcome, message) => outcomes.push({ outcome, message })}
      queue={queue}
      ports={{} as SendSheetPorts}
    />,
  );
  return { host, outcomes, closed: () => closed };
};

const cards = (host: HTMLElement) => [...host.querySelectorAll('[data-send-content-card]')].map((card) => card.getAttribute('data-send-content-card'));
const tab = (host: HTMLElement, title: string) => [...host.querySelectorAll<HTMLElement>('[role="tab"]')].find((node) => node.textContent?.includes(title)) ?? null;
const sendButton = (host: HTMLElement) => [...host.querySelectorAll<HTMLButtonElement>('button')].find((node) => node.textContent?.includes('Envoyer à Léo')) ?? null;

describe('« Lui envoyer un contenu » : la feuille', () => {
  test('mes publications s affichent depuis le cache, en grille de trois, sans squelette', async () => {
    seed([post('p1'), post('r1', { type: 'REEL', media: [{ id: 'v1', mimeType: 'video/mp4', fileUrl: '/u/v.mp4' }] }), post('p2')]);
    const { host } = await render(fakeQueue({ state: 'sent' }).queue);
    expect(host.querySelector('[data-send-content-loading]')).toBeNull();
    expect(cards(host)).toEqual(['p1', 'p2']);
    expect((host.querySelector('[data-send-content-grid]') as HTMLElement | null)?.style.gridTemplateColumns).toContain('repeat(3');
  });

  test('Réels et Stories changent la grille', async () => {
    seed(
      [post('p1'), post('r1', { type: 'REEL', media: [{ id: 'v1', mimeType: 'video/mp4', fileUrl: '/u/v.mp4' }] })],
      [{ id: 's1', type: 'STORY', createdAt: now, author: { id: ME }, media: [{ id: 'm1', fileUrl: '/u/s.jpg', mimeType: 'image/jpeg' }] }],
    );
    const { host } = await render(fakeQueue({ state: 'sent' }).queue);
    await click(tab(host, 'Réels'));
    expect(cards(host)).toEqual(['r1']);
    await click(tab(host, 'Stories'));
    expect(cards(host)).toEqual(['s1']);
  });

  test('« Envoyer » attend un choix ; un toucher choisit, et l envoi part vers Léo puis la feuille se ferme', async () => {
    seed([post('p1'), post('p2')]);
    const { queue, jobs } = fakeQueue({ state: 'sent', conversationId: 'c1' });
    const { host, outcomes, closed } = await render(queue);
    expect(sendButton(host)?.getAttribute('aria-disabled')).toBe('true');
    await click(host.querySelector<HTMLElement>('[data-send-content-pick="p2"]'));
    expect(host.querySelector('[data-send-content-pick="p2"]')?.getAttribute('aria-pressed')).toBe('true');
    expect(sendButton(host)?.getAttribute('aria-disabled')).toBeNull();
    await click(sendButton(host));
    expect(jobs).toHaveLength(1);
    expect(jobs[0]?.entries[0]?.target).toEqual({ kind: 'contact', userId: LEO.id, label: 'Léo' });
    expect(jobs[0]?.entries[0]?.steps[0]).toEqual({ kind: 'open-direct', userId: LEO.id });
    expect(outcomes).toEqual([{ outcome: 'sent', message: 'Envoyé à Léo.' }]);
    expect(closed()).toBe(1);
  });

  test('un refus (conversation chiffrée de bout en bout) se dit et la feuille reste ouverte', async () => {
    seed([post('p1')]);
    const { queue } = fakeQueue({ state: 'failed', failure: { kind: 'refused', status: 0, message: 'Conversation chiffrée de bout en bout' } });
    const { host, outcomes, closed } = await render(queue);
    await click(host.querySelector<HTMLElement>('[data-send-content-pick="p1"]'));
    await click(sendButton(host));
    expect(outcomes[0]?.outcome).toBe('refused');
    expect(closed()).toBe(0);
  });

  test('aucun contenu et plus rien à lire : le vide se dit', async () => {
    seed([]);
    const { host } = await render(fakeQueue({ state: 'sent' }).queue);
    expect(host.querySelector('[data-send-content-empty]')).not.toBeNull();
  });
});
