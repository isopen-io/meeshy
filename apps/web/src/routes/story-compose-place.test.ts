import { afterAll, beforeAll, describe, expect, test } from 'bun:test';

import { emptyStudioDraft, type StudioDraft } from '@/lib/stories/studio';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { studioPlacer } from './story-compose-place';

beforeAll(() => {
  ensureHappyDomRegistered();
});

afterAll(async () => {
  await releaseHappyDomIfRegistered();
});

/**
 * #9693 — un .mp4 posé à la porte SONORE d'une story y entre, et part vers la
 * passerelle comme un son (`audio/mp4`) : sans cela la porte le refusait, et
 * la story ne pouvait pas porter le son que l'utilisateur avait choisi.
 */
function placerFor(): { readonly place: (door: 'sound', file: File) => void; readonly uploads: File[]; readonly refusals: unknown[]; readonly draft: () => StudioDraft } {
  const latest = { current: emptyStudioDraft('fr') };
  const uploads: File[] = [];
  const refusals: unknown[] = [];
  const apply = (change: (current: StudioDraft) => StudioDraft) => {
    latest.current = change(latest.current);
  };
  const { place } = studioPlacer({
    latest,
    edit: apply,
    setDraft: apply,
    blobs: { current: new Set<string>() },
    head: () => 0,
    language: 'fr',
    startUpload: (_pageId, _door, file) => void uploads.push(file),
    retouching: false,
    refuse: (notice) => void refusals.push(notice),
  });
  return { place, uploads, refusals, draft: () => latest.current };
}

describe('studioPlacer — la porte sonore et le .mp4 (#9693)', () => {
  test('un .mp4 posé comme son est accepté et téléversé sous audio/mp4', () => {
    const placer = placerFor();

    placer.place('sound', new File([new Uint8Array([1, 2, 3])], 'podcast.mp4', { type: 'video/mp4' }));

    expect(placer.refusals.filter((notice) => notice !== null)).toEqual([]);
    expect(placer.uploads.map((file) => [file.name, file.type])).toEqual([['podcast.mp4', 'audio/mp4']]);
  });

  test('un .wav nommé audio/x-wav est accepté tel quel', () => {
    const placer = placerFor();

    placer.place('sound', new File([new Uint8Array([1])], 'note.wav', { type: 'audio/x-wav' }));

    expect(placer.uploads).toHaveLength(1);
  });
});
