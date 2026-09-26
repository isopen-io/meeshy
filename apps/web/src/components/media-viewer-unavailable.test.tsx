import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';
import { messagesOf } from '@/lib/api/fixtures';
import { MEDIA_CONVERSATION_ID } from '@/lib/api/fixtures-media';
import { MEDIA_GRID_QUAD_WITNESS_ID } from '@/lib/api/fixtures-media-grid';
import type { Attachment } from '@/lib/api/types';

import MediaViewer from './media-viewer';

/**
 * **UN MÉDIA INTROUVABLE DANS LA VISIONNEUSE (#8141).** Recette staging du
 * 2026-09-26 : trois pièces dont le fichier manquait au stockage (404)
 * s'ouvraient sur l'icône brisée du navigateur et le NOM DE FICHIER brut au
 * centre, la pellicule en vignettes brisées. La page dessine désormais l'état
 * « Média indisponible », « Réessayer » s'offrant sur un échec TRANSITOIRE
 * seulement ; la pellicule montre la même absence.
 */

const quad = (): readonly Attachment[] => {
  const message = messagesOf(MEDIA_CONVERSATION_ID).find((m) => m.id === MEDIA_GRID_QUAD_WITNESS_ID);
  if (!message) throw new Error('témoin introuvable');
  return message.attachments ?? [];
};

const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
const realFetch = globalThis.fetch;

beforeAll(() => {
  ensureHappyDomRegistered();
  globals.IS_REACT_ACT_ENVIRONMENT = true;
});

afterAll(async () => {
  await act(async () => {});
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
});

let container: HTMLDivElement;
let root: Root;

afterEach(() => {
  globalThis.fetch = realFetch;
  act(() => {
    root.unmount();
  });
  container.remove();
  document.body.removeAttribute('id');
});

const answering = (status: number) => {
  const probes: string[] = [];
  // Le faux `fetch` du dépôt (motif `composer-sticker-sheet.test.tsx`) : seule
  // la signature d'appel sert à la sonde, jamais les membres statiques.
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    probes.push(`${init?.method ?? 'GET'} ${String(input)}`);
    return new Response(null, { status });
  }) as unknown as typeof fetch;
  return probes;
};

function mount(): HTMLElement {
  container = document.createElement('div');
  container.id = 'root';
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root.render(<MediaViewer items={quad()} startIndex={0} onClose={() => {}} languages={['fr']} fallbackLanguage="fr" />);
  });
  return document.body;
}

function currentPage(body: HTMLElement): HTMLElement {
  const found = Array.from(body.querySelectorAll<HTMLElement>('[data-viewer-page]')).find((p) => p.style.transform === 'translateX(0%)');
  if (found === undefined) throw new Error('page courante introuvable');
  return found;
}

const failImage = async (img: Element | null | undefined) => {
  if (!img) throw new Error('image absente');
  await act(async () => {
    img.dispatchEvent(new Event('error'));
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
};

describe('MediaViewer — un fichier introuvable (#8141)', () => {
  test('un 404 sur la page courante dessine « Média indisponible », sans image brisée ni « Réessayer »', async () => {
    const probes = answering(404);
    const body = mount();
    const src = currentPage(body).querySelector('img')?.getAttribute('src');
    await failImage(currentPage(body).querySelector('img'));
    const page = currentPage(body);
    expect(page.querySelector('img')).toBeNull();
    expect(page.querySelector('[data-media-unavailable]')?.getAttribute('aria-label')).toBe('Média indisponible');
    expect(page.querySelector('[data-media-retry]')).toBeNull();
    expect(probes).toEqual([`HEAD ${src}`]);
  });

  test('une passerelle en panne offre « Réessayer », qui remonte l’image', async () => {
    answering(503);
    const body = mount();
    await failImage(currentPage(body).querySelector('img'));
    const retry = currentPage(body).querySelector<HTMLButtonElement>('[data-media-retry]');
    expect(retry?.textContent).toBe('Réessayer');
    await act(async () => {
      retry?.click();
    });
    expect(currentPage(body).querySelector('[data-media-unavailable]')).toBeNull();
    expect(currentPage(body).querySelector('img')).not.toBeNull();
  });

  test('une vignette de pellicule introuvable montre la même absence, jamais une image brisée', async () => {
    answering(404);
    const body = mount();
    const firstThumb = body.querySelector('[data-filmstrip-item] img');
    await failImage(firstThumb);
    const item = body.querySelector('[data-filmstrip-item]');
    expect(item?.querySelector('img')).toBeNull();
    expect(item?.querySelector('[data-media-unavailable]')).not.toBeNull();
  });
});
