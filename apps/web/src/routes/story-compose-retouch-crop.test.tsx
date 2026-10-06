import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';

import { MEDIA_CROP_RATIOS } from '@meeshy/shared/utils/media-crop';

import type { StudioVisualAsset } from '@/lib/stories/studio-page';
import { loadInterfaceCatalog } from '@/lib/i18n-catalog';
import { IDENTITY_POSE } from '@/lib/stories/studio-pose';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { StudioCropControls } from './story-compose-retouch-edits';

/**
 * LES PROPORTIONS DU RECADRAGE SONT UNE SEULE LISTE (#9499) — la retouche du
 * fond (#9136) offrait la sienne, écrite à la main ; iOS la sienne. Les deux
 * lisent désormais `MEDIA_CROP_RATIOS` (`@meeshy/shared/utils/media-crop`).
 */
const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };

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

const asset = (aspectRatio: number): StudioVisualAsset => ({
  previewUrl: 'blob:bg',
  mediaType: 'image',
  upload: { phase: 'uploading', progress: 0 },
  caption: '',
  pose: IDENTITY_POSE,
  aspectRatio,
});

const mounted = (aspectRatio: number) => {
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  act(() => root.render(<StudioCropControls lang="fr" asset={asset(aspectRatio)} onPage={() => {}} />));
  return {
    pads: () => [...host.querySelectorAll<HTMLButtonElement>('[data-story-crop-ratio]')],
    unmount: () => {
      act(() => root.unmount());
      host.remove();
    },
  };
};

describe('les pastilles de recadrage de la retouche', () => {
  test('offrent la liste partagée, dans son ordre', () => {
    const view = mounted(4 / 3);
    expect(view.pads().map((pad) => pad.dataset.storyCropRatio)).toEqual(
      MEDIA_CROP_RATIOS.map((ratio) => ratio.notation ?? 'original'),
    );
    view.unmount();
  });

  test('une pastille 3:4 dit sa notation, le cadre d’origine est coché sans recadrage', () => {
    const view = mounted(4 / 3);
    const pads = view.pads();
    expect(pads.find((pad) => pad.dataset.storyCropRatio === '3:4')?.textContent).toBe('3:4');
    expect(pads.find((pad) => pad.dataset.storyCropRatio === 'original')?.getAttribute('aria-checked')).toBe('true');
    view.unmount();
  });
});
