import { describe, expect, test } from 'bun:test';
import { QueryClient } from '@tanstack/react-query';

import { scriptedTransport } from '@/test-support/scripted-transport';

import { composeStoryCanvas } from './story-document';
import type { StudioEditSavePlan } from './studio-edit-plan';
import { saveStudioEdit } from './studio-edit-flow';
import { newTextLayer } from './studio-text';

/**
 * **L'ENVOI D'UN « ENREGISTRER »** (#9317) — le `PUT` d'abord, les stories
 * neuves ENSUITE et dans l'ordre des pages ; un refus du `PUT` arrête tout :
 * aucune scène ajoutée ne part sur une story qui n'a pas été modifiée.
 */
const effects = (value: string) => composeStoryCanvas({ texts: [{ ...newTextLayer({ id: 'text-1', language: 'fr' }), text: value }] })!;

const storyPlan: Extract<StudioEditSavePlan, { kind: 'ready' }> = {
  kind: 'ready',
  update: { postId: 's-1', pageIds: ['page-1'], body: { storyEffects: effects('Modifiée') } },
  creations: { kind: 'ready', publications: [{ pageIds: ['page-2'], hasText: true, storyEffects: effects('Neuve'), mediaIds: [] }] },
};

const run = (replies: Parameters<typeof scriptedTransport>[0], plan = storyPlan) => {
  const { transport, calls } = scriptedTransport(replies);
  const published: string[] = [];
  const outcome = saveStudioEdit({
    plan,
    api: { source: 'gateway', transport },
    queryClient: new QueryClient(),
    kind: 'STORY',
    visibility: null,
    language: 'fr',
    onPublished: ({ pageIds }) => published.push(...pageIds),
  });
  return { outcome, calls, published };
};

describe('saveStudioEdit (#9317)', () => {
  test('le PUT de la story, PUIS la story neuve de la scène ajoutée — et seule cette dernière quitte le brouillon', async () => {
    const { outcome, calls, published } = run({
      'PUT /api/v1/posts/s-1': { ok: true, data: { id: 's-1', type: 'STORY', createdAt: '2026-10-01T10:00:00.000Z' } },
      'POST /api/v1/posts': { ok: true, data: { id: 's-2' } },
    });
    expect(await outcome).toEqual({ kind: 'published', postIds: ['s-1', 's-2'] });
    expect(calls().map((call) => `${call.method} ${call.path}`)).toEqual(['PUT /api/v1/posts/s-1', 'POST /api/v1/posts']);
    expect(calls()[1]?.body).toMatchObject({ type: 'STORY', originalLanguage: 'fr' });
    expect(published).toEqual(['page-2']);
  });

  test('un PUT refusé : rien d’autre ne part, l’échec se dit', async () => {
    const { outcome, calls } = run({ 'PUT /api/v1/posts/s-1': { ok: false, status: 422, error: 'refus', code: 'INVALID_POST_UPDATE' } });
    expect(await outcome).toEqual({ kind: 'failed', failure: 'story.studio.failure.refused', published: 0, total: 2 });
    expect(calls()).toHaveLength(1);
  });

  test('un post : le PUT seul', async () => {
    const plan = { ...storyPlan, creations: null };
    const { outcome, calls } = run({ 'PUT /api/v1/posts/s-1': { ok: true, data: { id: 's-1', type: 'POST', createdAt: '2026-10-01T10:00:00.000Z' } } }, plan);
    expect(await outcome).toEqual({ kind: 'published', postIds: ['s-1'] });
    expect(calls()).toHaveLength(1);
  });
});
