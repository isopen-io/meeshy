import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import * as exportJobs from '@/lib/export/scene/scene-export-jobs';
import { imagerLengthChoices } from '@/lib/export/scene/scene-export-length';
import { loadSceneExportCatalog } from '@/lib/i18n-scene-export-catalog';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { SceneExportTray } from './scene-export-tray';

const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };

beforeAll(async () => {
  ensureHappyDomRegistered();
  globals.IS_REACT_ACT_ENVIRONMENT = true;
  await loadSceneExportCatalog('fr');
});

afterAll(async () => {
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
});

let mounted: { readonly root: Root; readonly container: HTMLElement } | null = null;

function mount(): HTMLElement {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => root.render(<SceneExportTray />));
  mounted = { root, container };
  return container;
}

afterEach(() => {
  act(() => {
    for (const job of exportJobs.getSnapshot().jobs) exportJobs.cancel(job.key);
    const notice = exportJobs.getSnapshot().notice;
    if (notice !== null) exportJobs.dismissNotice(notice.id);
  });
  if (mounted !== null) {
    const { root, container } = mounted;
    act(() => root.unmount());
    container.remove();
    mounted = null;
  }
});

const buttonNamed = (container: HTMLElement, name: string): HTMLButtonElement | undefined =>
  [...container.querySelectorAll('button')].find((button) => button.textContent === name);

describe('le bandeau des exports — suivre, choisir, annuler, de n’importe quel écran', () => {
  test('rien ne se peint tant qu’aucun export ne tourne', () => {
    expect(mount().querySelector('[data-scene-export-tray]')).toBeNull();
  });

  test('un export montre sa progression et s’annule', () => {
    const container = mount();
    let handle: exportJobs.SceneExportJobHandle | null = null;
    act(() => {
      handle = exportJobs.start('post:p1');
    });
    expect(container.textContent).toContain('Préparation de l’export…');
    act(() => (handle as exportJobs.SceneExportJobHandle | null)?.report(0.42));
    expect(container.textContent).toContain('Export en cours · 42 %');
    expect(container.querySelector('[role="progressbar"]')?.getAttribute('aria-valuenow')).toBe('42');
    act(() => buttonNamed(container, 'Annuler l’export')?.click());
    expect((handle as exportJobs.SceneExportJobHandle | null)?.signal.aborted).toBe(true);
    expect(container.querySelector('[data-scene-export-tray]')).toBeNull();
  });

  test('« Imager » d’une story de 4 min offre 1/4 · 2/4 · 3/4 · 4/4 avec leur durée, et rend la part choisie', async () => {
    const container = mount();
    let answer: Promise<unknown> = Promise.resolve();
    act(() => {
      answer = exportJobs.start('post:p1')?.chooseLength(imagerLengthChoices(240_000)) ?? answer;
    });
    const options = [...container.querySelectorAll('[data-imager-quarter]')].map((button) => button.textContent);
    expect(options).toEqual(['1/4 · 1:00', '2/4 · 2:00', '3/4 · 3:00', '4/4 · 4:00']);
    expect(container.querySelector('[role="dialog"]')?.textContent).toContain('Depuis le début de la publication');
    act(() => buttonNamed(container, '2/4 · 2:00')?.click());
    expect(await answer).toBe(2);
    expect(container.querySelector('[role="dialog"]')).toBeNull();
  });

  test('un fichier prêt à partager attend le toucher « Partager », qui ouvre la feuille dans son propre clic', async () => {
    const container = mount();
    const shared: string[] = [];
    let handle: exportJobs.SceneExportJobHandle | null = null;
    let answer: Promise<unknown> = Promise.resolve();
    act(() => {
      handle = exportJobs.start('story:s1');
      answer =
        handle?.awaitDeliveryTap(() => {
          shared.push('feuille');
          return Promise.resolve('delivered');
        }) ?? answer;
    });
    expect(container.querySelector('[data-scene-export-ready="story:s1"]')?.textContent).toContain('Fichier prêt à partager');
    expect(shared).toEqual([]);
    act(() => buttonNamed(container, 'Partager')?.click());
    expect(shared).toEqual(['feuille']);
    expect(await answer).toBe('delivered');
    act(() => (handle as exportJobs.SceneExportJobHandle | null)?.finish());
  });

  test('« Partager » réussi se dit « Fichier partagé »', () => {
    const container = mount();
    act(() => exportJobs.announce('shared'));
    expect(container.querySelector('[role="status"]')?.textContent).toBe('Fichier partagé');
  });

  test('l’issue se dit dans la région d’annonce', () => {
    const container = mount();
    act(() => exportJobs.announce('saved'));
    expect(container.querySelector('[role="status"]')?.textContent).toBe('Publication enregistrée');
  });
});
