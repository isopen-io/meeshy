import { act } from 'react';
import { describe, expect, test } from 'bun:test';

import { STUDIO_PAGE_MAX } from '@/lib/stories/studio';
import { flush, harness, mount, registerStudioBench } from '@/test-support/story-studio-bench';

/**
 * `StoryComposeScreen` — IMPORTER PLUSIEURS MÉDIAS D'UN GESTE (#8533) : la
 * porte du fond est `multiple` dès l'ouverture du studio, et N fichiers
 * choisis font N scènes, chacune montée par le chemin ordinaire.
 */

registerStudioBench();

const pageTiles = (host: ParentNode) => host.querySelectorAll<HTMLButtonElement>('[data-story-studio-page-tile]');
const media = (name: string, type = 'image/jpeg') => new File([new Uint8Array([1, 2, 3])], name, { type });

function selectFiles(host: ParentNode, files: readonly File[]): void {
  const input = host.querySelector<HTMLInputElement>('input[data-door="visual"]')!;
  const transfer = new DataTransfer();
  files.forEach((file) => transfer.items.add(file));
  act(() => {
    Object.defineProperty(input, 'files', { value: transfer.files, configurable: true });
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });
}

describe('StoryComposeScreen — importer plusieurs médias d’un geste (#8533)', () => {
  test('la porte du fond accepte PLUSIEURS fichiers dès l’ouverture, au post comme à la story', () => {
    for (const kind of ['POST', 'STORY'] as const) {
      const el = mount(harness({}).deps, kind);
      expect(el.querySelector<HTMLInputElement>('input[data-door="visual"]')?.multiple).toBe(true);
      expect(el.querySelector<HTMLInputElement>('input[data-door="overlay"]')?.multiple).toBe(false);
    }
  });

  test('trois médias ⇒ trois scènes, la première courante, chacune montée une fois', async () => {
    const bench = harness({});
    const el = mount(bench.deps, 'POST');
    selectFiles(el, [media('a.jpg'), media('b.mp4', 'video/mp4'), media('c.png', 'image/png')]);
    await flush(() => pageTiles(el).length === 3 && bench.uploadCreations() === 3);
    expect(pageTiles(el)[0]?.getAttribute('aria-current')).toBe('true');
    expect(el.querySelector('[data-scene-stage]')?.getAttribute('data-story-studio-current-page')).toBe('page-1');
    expect(bench.uploadCreations()).toBe(3);
  });

  test('au-delà du plafond, le pied dit combien de médias n’ont pas été importés', async () => {
    const bench = harness({});
    const el = mount(bench.deps, 'POST');
    selectFiles(el, Array.from({ length: STUDIO_PAGE_MAX + 2 }, (_, i) => media(`m${i}.jpg`)));
    await flush(() => pageTiles(el).length === STUDIO_PAGE_MAX);
    const refusal = el.querySelector('[data-place-refusal]');
    expect(refusal?.getAttribute('data-place-refusal')).toBe('import-max');
    expect(refusal?.textContent).toContain('2');
  });

  test('un seul fichier se pose comme avant : il remplace le fond de la page courante', async () => {
    const bench = harness({});
    const el = mount(bench.deps, 'POST');
    selectFiles(el, [media('a.jpg')]);
    await flush(() => bench.uploadCreations() === 1);
    selectFiles(el, [media('b.jpg')]);
    await flush(() => bench.uploadCreations() === 2);
    expect(pageTiles(el)).toHaveLength(0);
  });
});
