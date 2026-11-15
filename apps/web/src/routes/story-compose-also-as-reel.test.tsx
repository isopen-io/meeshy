import { act } from 'react';
import { describe, expect, test } from 'bun:test';

import { createStudioDraftStore } from '@/lib/stories/studio-draft-store';
import type { StudioMediaKind } from '@/lib/stories/story-document';
import { VIEWER_ID, flush, harness, mount, onePageSnapshot, publishButton, registerStudioBench } from '@/test-support/story-studio-bench';

/**
 * **UNE STORY PART AUSSI EN RÉEL, D'UN SEUL GESTE** (#9476) — au studio, une
 * story qui qualifie pour un réel coche Story ET Réel au menu de la capsule,
 * la capsule nomme les deux, et Publier envoie UNE requête `type: STORY`
 * portant `alsoAsReel` — la passerelle publie les deux. Une story qui ne
 * qualifie pas n'annonce jamais de réel.
 */

registerStudioBench();

const seeded = (mediaType: StudioMediaKind) => {
  const drafts = createStudioDraftStore(null);
  const media = { postMediaId: 'pm-v', fileUrl: `2026/10/u/v.${mediaType === 'video' ? 'mp4' : 'jpg'}`, mediaType, aspectRatio: 9 / 16, durationMs: 12_000 };
  drafts.set(VIEWER_ID, onePageSnapshot({ texts: [], visibility: 'FRIENDS', background: media }));
  return harness({ drafts });
};

const openMenu = (el: HTMLElement) => act(() => el.querySelector<HTMLButtonElement>('[data-publish-kind-toggle]')!.click());
const row = (kind: 'STORY' | 'POST' | 'REEL') => document.querySelector<HTMLButtonElement>(`[data-publish-kind-choice="${kind}"]`);
const checked = (kind: 'STORY' | 'POST' | 'REEL') => Boolean(row(kind)?.querySelector('svg'));

describe('studio — une story qui qualifie part aussi en réel (#9476)', () => {
  test('toucher Réel coche les DEUX formats, la capsule les nomme, et Publier envoie la story avec son réel', async () => {
    const bench = seeded('video');
    const el = mount(bench.deps, 'STORY');
    await flush(() => publishButton(el) !== null);

    openMenu(el);
    act(() => row('REEL')!.click());
    expect(publishButton(el)!.textContent).toBe('Publier la story et le réel');

    openMenu(el);
    expect(checked('STORY')).toBe(true);
    expect(checked('REEL')).toBe(true);
    expect(checked('POST')).toBe(false);
    openMenu(el);

    act(() => publishButton(el)!.click());
    await flush(() => bench.posts.length > 0);
    expect(bench.posts).toHaveLength(1);
    expect(bench.posts[0]?.type).toBe('STORY');
    expect(bench.posts[0]?.alsoAsReel).toBe(true);
    expect(bench.posts[0]?.mediaIds).toEqual(['pm-v']);
  });

  test('sans le geste, la story part seule, sans la clé — exactement comme avant', async () => {
    const bench = seeded('video');
    const el = mount(bench.deps, 'STORY');
    await flush(() => publishButton(el) !== null);
    act(() => publishButton(el)!.click());
    await flush(() => bench.posts.length > 0);
    expect(bench.posts[0]?.type).toBe('STORY');
    expect(Object.hasOwn(bench.posts[0] ?? {}, 'alsoAsReel')).toBe(false);
  });

  test('une photo seule ne qualifie pas : Réel reste grisé, et rien n’annonce un réel', async () => {
    const bench = seeded('image');
    const el = mount(bench.deps, 'STORY');
    await flush(() => publishButton(el) !== null);
    openMenu(el);
    expect(row('REEL')!.getAttribute('aria-disabled')).toBe('true');
    act(() => row('REEL')!.click());
    expect(publishButton(el)!.textContent).toBe('Publier la story');
  });
});
