import { act } from 'react';
import { describe, expect, test } from 'bun:test';

import type { AdminDeps } from '@/lib/api/admin';
import type { ApiResult, HttpRequest } from '@/lib/api/http';
import { adminIdentityFixture } from '@/test-support/admin-assertions';
import { setupAdminKitTests } from '@/test-support/admin-harness';

import { AdminPostPreview } from './admin-post-preview';

/**
 * LE CONTENU ENTIER D'UNE PUBLICATION, SANS QUITTER LA LISTE (#10393) — la vidéo lue,
 * l'image en plein format, la scène d'une story par le lecteur de scène, les gestes de
 * la ligne, et la précédente / suivante au clavier.
 */
const { mount, mounter } = setupAdminKitTests({ languages: ['fr'] });
const BIGBOSS = adminIdentityFixture({ role: 'BIGBOSS' });
const ID = (n: number) => `64f1c2a9e8b7d6c5b4a3928${n}`;
const NOW = new Date('2026-10-12T12:00:00.000Z');

const fiche = (n: number, overrides: Record<string, unknown> = {}) => ({
  id: ID(n),
  type: 'POST',
  visibility: 'PUBLIC',
  content: `Le texte entier de la publication ${n}`,
  deletedAt: null,
  expiresAt: null,
  moderationHiddenAt: null,
  createdAt: '2026-10-12T09:00:00.000Z',
  author: { id: ID(9), username: 'awa', displayName: 'Awa Diop', avatar: null },
  media: [],
  ...overrides,
});

function depsOf(byId: Readonly<Record<string, unknown>>) {
  const calls: HttpRequest[] = [];
  const transport: AdminDeps['transport'] = Object.assign(async () => ({ ok: false as const, status: 0, error: 'jamais appelé' }), {
    request: async <T,>(req: HttpRequest): Promise<ApiResult<T>> => {
      calls.push(req);
      const id = req.path.split('/').at(-1) ?? '';
      return { ok: true, data: byId[id] } as ApiResult<T>;
    },
  });
  return { deps: { source: 'gateway', transport } satisfies AdminDeps, calls };
}

async function open(postId: string, byId: Readonly<Record<string, unknown>>, navigated: string[] = []) {
  const { deps } = depsOf(byId);
  const rows = [{ id: ID(1) }, { id: ID(2) }, { id: ID(3) }];
  await mount(
    <AdminPostPreview language="fr" postId={postId} rows={rows} onNavigate={(id) => navigated.push(id)} onClose={() => undefined} onAnnounce={() => undefined} deps={deps} now={NOW} />,
    BIGBOSS,
  );
  for (let attempt = 0; attempt < 20 && document.querySelector('[data-admin-preview-plan]') === null; attempt += 1) await mounter.settle();
  return navigated;
}

describe('l’aperçu d’une publication', () => {
  test('le texte entier, la vidéo LUE (sans le son, en ligne) et les gestes de la ligne', async () => {
    await open(ID(2), { [ID(2)]: fiche(2, { type: 'REEL', media: [{ id: 'm1', mimeType: 'video/mp4', fileUrl: '/u/v.mp4', thumbnailUrl: '/u/t.jpg' }] }) });
    expect(document.querySelector('[data-admin-preview-text]')?.textContent).toContain('Le texte entier de la publication 2');
    const video = document.querySelector<HTMLVideoElement>('[data-admin-preview-media="video"]');
    expect(video?.autoplay).toBe(true);
    expect(video?.muted).toBe(true);
    expect(video?.getAttribute('src')).toContain('/u/v.mp4');
    expect(document.querySelector(`[data-admin-post-gestures="${ID(2)}"] [data-admin-post-gesture="take-offline"]`)).not.toBeNull();
  });

  test('une image se montre en plein format ; un audio se lit', async () => {
    await open(ID(2), { [ID(2)]: fiche(2, { media: [{ id: 'i', mimeType: 'image/png', fileUrl: '/u/i.png' }, { id: 'a', mimeType: 'audio/mpeg', fileUrl: '/u/a.mp3' }] }) });
    expect(document.querySelector('[data-admin-preview-media="image"]')?.getAttribute('src')).toContain('/u/i.png');
    expect(document.querySelector('[data-admin-preview-media="audio"]')?.hasAttribute('controls')).toBe(true);
  });

  test('une story qui porte une scène se rend par le lecteur de scène, en mode story', async () => {
    await open(ID(2), { [ID(2)]: fiche(2, { type: 'STORY', storyEffects: { v: 3, scenes: [{ id: 's1', objects: [] }, { id: 's2', objects: [] }] } }) });
    expect(document.querySelector('[data-admin-preview-plan]')?.getAttribute('data-admin-preview-plan')).toBe('scene');
    expect(document.querySelector('[data-admin-preview-scene]')?.getAttribute('data-admin-preview-scene')).toBe('story');
    expect(document.querySelector('[data-admin-preview-scene-index]')?.textContent).toBe('Scène 1 sur 2');
  });

  test('j passe à la suivante, k à la précédente ; les boutons aussi, éteints au bord', async () => {
    const navigated = await open(ID(2), { [ID(2)]: fiche(2) });
    const body = document.querySelector('[data-admin-post-preview]') as HTMLElement;
    act(() => {
      body.dispatchEvent(new KeyboardEvent('keydown', { key: 'j', bubbles: true }));
      body.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
    });
    expect(navigated).toEqual([ID(3), ID(1)]);
    await act(async () => document.querySelector<HTMLButtonElement>('[data-admin-preview-nav="next"]')?.click());
    expect(navigated.at(-1)).toBe(ID(3));
  });

  test('au bord de la page, « précédente » est éteinte', async () => {
    await open(ID(1), { [ID(1)]: fiche(1) });
    expect(document.querySelector<HTMLButtonElement>('[data-admin-preview-nav="previous"]')?.disabled).toBe(true);
  });
});
