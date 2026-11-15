import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import type { CommentSettingOutcome } from '@/lib/api/comment-settings';
import { appQueryClient } from '@/lib/api/query-client';
import { STORY_FEED_QUERY_KEY, type StoryFeedPost } from '@/lib/api/stories';
import { loadInterfaceCatalog } from '@/lib/i18n-catalog';
import { createActMounter } from '@/test-support/act-mount';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { useStoryCommentSettings } from './story-comment-settings';

/**
 * #16541 — « DÉSACTIVER / RÉACTIVER LES COMMENTAIRES » D'UNE STORY : offert à
 * l'auteur et à la modération de plateforme, jamais à un lecteur ordinaire ;
 * le libellé suit le réglage servi, l'issue s'annonce.
 */
const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };

beforeAll(async () => {
  ensureHappyDomRegistered();
  globals.IS_REACT_ACT_ENVIRONMENT = true;
  await loadInterfaceCatalog('fr');
});

afterAll(async () => {
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
});

const mounter = createActMounter();
afterEach(() => {
  mounter.unmountAll();
  appQueryClient.clear();
});

const seedStory = (commentsDisabled: boolean) =>
  appQueryClient.setQueryData<readonly StoryFeedPost[]>(STORY_FEED_QUERY_KEY, [{ id: 's-1', type: 'STORY', createdAt: '2026-11-01T10:00:00.000Z', commentsDisabled }]);

function Probe(props: { readonly role: string | null; readonly isMine: boolean; readonly outcome: CommentSettingOutcome; readonly journal: string[] }) {
  const { role, isMine, outcome, journal } = props;
  const settings = useStoryCommentSettings({
    storyId: 's-1',
    isMine,
    platformRole: role,
    announce: (message) => journal.push(`announce:${message}`),
    toggle: async (id, disabled) => {
      journal.push(`toggle:${id}:${String(disabled)}`);
      return outcome;
    },
  });
  return settings.onToggle === undefined ? null : (
    <button type="button" data-probe-toggle={settings.disabled ? 'on' : 'off'} onClick={settings.onToggle}>
      toggle
    </button>
  );
}

describe('useStoryCommentSettings', () => {
  test('offert à l’auteur et à MODERATOR/ADMIN/BIGBOSS — jamais à un lecteur ordinaire', async () => {
    expect((await mounter.mount(<Probe role="USER" isMine outcome="done" journal={[]} />)).querySelector('[data-probe-toggle]')).not.toBeNull();
    for (const role of ['MODERATOR', 'ADMIN', 'BIGBOSS']) {
      expect((await mounter.mount(<Probe role={role} isMine={false} outcome="done" journal={[]} />)).querySelector('[data-probe-toggle]')).not.toBeNull();
    }
    expect((await mounter.mount(<Probe role="USER" isMine={false} outcome="done" journal={[]} />)).querySelector('[data-probe-toggle]')).toBeNull();
    expect((await mounter.mount(<Probe role={null} isMine={false} outcome="done" journal={[]} />)).querySelector('[data-probe-toggle]')).toBeNull();
  });

  test('ouverts : le geste les ferme et le dit', async () => {
    seedStory(false);
    const journal: string[] = [];
    const host = await mounter.mount(<Probe role={null} isMine outcome="done" journal={journal} />);
    expect(host.querySelector('[data-probe-toggle]')?.getAttribute('data-probe-toggle')).toBe('off');
    await mounter.click(host.querySelector('[data-probe-toggle]'));
    await mounter.settle();
    expect(journal).toEqual(['toggle:s-1:true', 'announce:Commentaires désactivés']);
  });

  test('fermés : le geste les rouvre ; un refus se dit', async () => {
    seedStory(true);
    const journal: string[] = [];
    const host = await mounter.mount(<Probe role={null} isMine outcome="forbidden" journal={journal} />);
    expect(host.querySelector('[data-probe-toggle]')?.getAttribute('data-probe-toggle')).toBe('on');
    await mounter.click(host.querySelector('[data-probe-toggle]'));
    await mounter.settle();
    expect(journal).toEqual(['toggle:s-1:false', 'announce:Le réglage des commentaires n’a pas été enregistré.']);
  });
});
