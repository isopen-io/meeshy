import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClientProvider } from '@tanstack/react-query';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import { appQueryClient } from '@/lib/api/query-client';
import { navigate } from '@/lib/router';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { Router } from './route-table';

/**
 * **LE LECTEUR DE STORIES OFFRE LES TRADUCTIONS** (#7114) — la route ENTIÈRE
 * montée sur fixtures, motif `card-translation-live.test.tsx` /
 * `publication-opening.test.tsx`. Le lecteur des fixtures est `['fr', 'en']`
 * (`READER_LANGUAGES`, `lib/reader.ts` — `en` au rang 2, `navigator.language`
 * sous happy-dom).
 *
 * **UN ÉCART DOCUMENTÉ AVEC LA SPÉCIFICATION** — § 5.5.5 en fait la règle
 * explicite : la pastille du Prisme (D-99) lit ce que l'AUTO servirait
 * (`reader.languages`, JAMAIS `language.choice`), « sinon la pastille
 * disparaîtrait dès qu'on montre l'original et ne pourrait plus revenir ».
 * Un témoin isolé de la même spécification (§ 4.7) attend pourtant qu'elle
 * DISPARAISSE après le choix explicite du chip « en » — les deux passages ne
 * peuvent pas être vrais en même temps pour la MÊME implémentation : faire
 * disparaître la pastille dès que le texte AFFICHÉ égale l'original romprait
 * exactement le cas que § 5.5.5 décrit en détail (choisir « Original » depuis
 * LA PASTILLE elle-même la ferait disparaître, et un second clic — que
 * `describe('… la pastille bascule original ↔ auto')` ci-dessous exige —
 * n'aurait plus rien à cliquer). Ce fichier suit § 5.5.5 : la pastille reste
 * montée tant que l'AUTO traduit, et son `active` (pas sa présence) reflète
 * le choix courant.
 */
const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };

beforeAll(() => {
  ensureHappyDomRegistered({ url: 'http://localhost/feed' });
  globals.IS_REACT_ACT_ENVIRONMENT = true;
});

afterAll(async () => {
  await act(async () => {});
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
});

let mounted: { readonly container: HTMLDivElement; readonly root: Root } | null = null;

afterEach(() => {
  act(() => mounted?.root.unmount());
  mounted?.container.remove();
  mounted = null;
  appQueryClient.clear();
  navigate('/feed', true);
});

const tick = () =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 20));
  });

async function waitFor(container: HTMLDivElement, selector: string): Promise<Element> {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const found = container.querySelector(selector);
    if (found !== null) return found;
    await tick();
  }
  throw new Error(`élément jamais monté : ${selector}`);
}

async function waitUntil(condition: () => boolean): Promise<void> {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    if (condition()) return;
    await tick();
  }
  throw new Error('condition jamais atteinte');
}

async function mountAt(url: string): Promise<HTMLDivElement> {
  navigate(url, true);
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  mounted = { container, root };
  await act(async () => {
    root.render(
      <QueryClientProvider client={appQueryClient}>
        <Router wrap={(children) => children} skeleton={null} />
      </QueryClientProvider>,
    );
  });
  await waitFor(container, '[data-story-scene]');
  return container;
}

const legendText = (host: HTMLDivElement): { readonly text: string; readonly lang: string | null } | null => {
  const p = host.querySelector('[data-story-scene] p:not([role="status"]):not([data-story-media-caption])');
  return p === null ? null : { text: p.textContent ?? '', lang: p.getAttribute('lang') };
};

describe('/story/st-amie-1 — le lecteur français d’une story anglaise', () => {
  test('les trois gardes vraies : le bouton Traductions est dans le DOM, nommé, badgé', async () => {
    const host = await mountAt('/story/st-amie-1');
    const button = host.querySelector('[data-story-action="translations"]');
    expect(button).not.toBeNull();
    expect(button?.getAttribute('aria-label')).toBe('Traductions');
    expect(button?.querySelector('[data-viewer-badge]')?.textContent).toBe('FR');
  });

  test('la légende lit « Bonjour depuis le parc ! » avec lang="fr" ; la pastille est là, non pressée', async () => {
    const host = await mountAt('/story/st-amie-1');
    const legend = legendText(host);
    expect(legend?.text).toBe('Bonjour depuis le parc !');
    expect(legend?.lang).toBe('fr');
    const pastille = host.querySelector('[data-prism-toggle]');
    expect(pastille).not.toBeNull();
    expect(pastille?.getAttribute('aria-pressed')).toBe('false');
  });

  test('clic sur Traductions ⇒ la barre est montée, la story est en PAUSE, le focus y entre', async () => {
    const host = await mountAt('/story/st-amie-1');
    const button = host.querySelector<HTMLButtonElement>('[data-story-action="translations"]')!;
    button.focus();
    await act(async () => button.click());
    /* La barre est un chunk À LA DEMANDE (D-54) : elle se monte après l'import. */
    await waitFor(host, '[data-story-language-bar]');
    expect(host.querySelector('[data-story-scene]')?.getAttribute('data-story-paused')).toBe('true');
    await waitUntil(() => document.activeElement?.hasAttribute('data-story-language') === true);
    expect(host.contains(document.activeElement)).toBe(true);
  });

  test('clic sur le chip "en" ⇒ légende "Hello from the park!" lang="en", barre fermée, reprise, badge "EN", focus rendu', async () => {
    const host = await mountAt('/story/st-amie-1');
    const translationsButton = host.querySelector<HTMLButtonElement>('[data-story-action="translations"]')!;
    translationsButton.focus();
    await act(async () => translationsButton.click());
    const chipEn = (await waitFor(host, '[data-story-language="en"]')) as HTMLButtonElement;
    await act(async () => chipEn.click());

    const legend = legendText(host);
    expect(legend?.text).toBe('Hello from the park!');
    expect(legend?.lang).toBe('en');
    expect(host.querySelector('[data-story-language-bar]')).toBeNull();
    expect(host.querySelector('[data-story-scene]')?.hasAttribute('data-story-paused')).toBe(false);
    expect(host.querySelector('[data-story-action="translations"] [data-viewer-badge]')?.textContent).toBe('EN');
    expect(document.activeElement === translationsButton).toBe(true);
  });

  test('clic sur la pastille (état auto) ⇒ légende passe à l’original, aria-pressed="true" ; second clic ⇒ retour au français', async () => {
    const host = await mountAt('/story/st-amie-1');
    const pastille = host.querySelector<HTMLButtonElement>('[data-prism-toggle]')!;
    await act(async () => pastille.click());
    expect(legendText(host)?.text).toBe('Hello from the park!');
    expect(host.querySelector('[data-prism-toggle]')?.getAttribute('aria-pressed')).toBe('true');

    await act(async () => host.querySelector<HTMLButtonElement>('[data-prism-toggle]')!.click());
    expect(legendText(host)?.text).toBe('Bonjour depuis le parc !');
    expect(host.querySelector('[data-prism-toggle]')?.getAttribute('aria-pressed')).toBe('false');
  });

  test('barre ouverte, un pointerdown sur le plateau (hors barre) ⇒ elle se ferme et la story N’AVANCE PAS', async () => {
    const host = await mountAt('/story/st-amie-1');
    await act(async () => host.querySelector<HTMLButtonElement>('[data-story-action="translations"]')!.click());
    await waitFor(host, '[data-story-language-bar]');

    const scene = host.querySelector('[data-story-scene]')!;
    const sceneIdBefore = scene.getAttribute('data-story-scene');
    await act(async () => {
      scene.dispatchEvent(new window.PointerEvent('pointerdown', { bubbles: true, clientX: 10, clientY: 10 }));
      scene.dispatchEvent(new window.PointerEvent('pointerup', { bubbles: true, clientX: 10, clientY: 10 }));
    });
    expect(host.querySelector('[data-story-language-bar]')).toBeNull();
    expect(host.querySelector('[data-story-scene]')?.getAttribute('data-story-scene')).toBe(sceneIdBefore);
  });

  test('Échap, barre ouverte ⇒ la barre se ferme, le lecteur reste monté', async () => {
    const host = await mountAt('/story/st-amie-1');
    await act(async () => host.querySelector<HTMLButtonElement>('[data-story-action="translations"]')!.click());
    const bar = await waitFor(host, '[data-story-language-bar]');
    await act(async () => {
      bar.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });
    expect(host.querySelector('[data-story-language-bar]')).toBeNull();
    expect(host.querySelector('[data-story-scene]')).not.toBeNull();
  });

  test('ArrowRight (story suivante st-amie-2) après un choix "en" ⇒ le choix retombe, st-amie-2 est monolingue', async () => {
    const host = await mountAt('/story/st-amie-1');
    await act(async () => host.querySelector<HTMLButtonElement>('[data-story-action="translations"]')!.click());
    const chipEn = (await waitFor(host, '[data-story-language="en"]')) as HTMLButtonElement;
    await act(async () => chipEn.click());
    expect(legendText(host)?.lang).toBe('en');

    await act(async () => {
      window.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    });
    await waitUntil(() => host.querySelector('[data-story-scene]')?.getAttribute('data-story-scene') === 'st-amie-2');
    expect(host.querySelector('[data-story-action="translations"]')).toBeNull();
  });
});

describe('/story/st-mienne?scope=mine — l’auteur explore sa propre story', () => {
  test('le bouton Traductions est présent à côté de « Vues » — aucune gate isOwnStory ; choisir "en" change la légende', async () => {
    const host = await mountAt('/story/st-mienne?scope=mine');
    const actions = [...host.querySelectorAll('[data-story-action]')].map((el) => el.getAttribute('data-story-action'));
    expect(actions).toContain('views');
    expect(actions).toContain('translations');

    await act(async () => host.querySelector<HTMLButtonElement>('[data-story-action="translations"]')!.click());
    const chipEn = (await waitFor(host, '[data-story-language="en"]')) as HTMLButtonElement;
    await act(async () => chipEn.click());
    const legend = legendText(host);
    expect(legend?.text).toBe('My very own story.');
    expect(legend?.lang).toBe('en');
  });
});

describe('/story/st-amie-2 — une story monolingue', () => {
  test('aucun bouton Traductions', async () => {
    const host = await mountAt('/story/st-amie-2');
    expect(host.querySelector('[data-story-action="translations"]')).toBeNull();
  });
});

/**
 * **`/story/st-scene` N'EST PAS MONTABLE ICI** — mesuré : sous happy-dom,
 * `ResizeObserver` (`lib/view/use-element-size.ts`, dont `StorySceneLayer`
 * dépend pour son `framing`) ne rend jamais de dimensions réelles (0×0
 * indéfiniment, faute de moteur de mise en page) : le verdict
 * `imageOnlyPresentation` reste `pending` pour toujours, `ScenePlayer` ne
 * monte jamais, et `[data-scene-text]` n'apparaît pas — quelle que soit la
 * story. C'est la RAISON pour laquelle `story-scene-layer.test.tsx` monte
 * `StorySceneLayer` DIRECTEMENT avec un `framing` fixe plutôt que par la
 * route entière, et pour laquelle AUCUN test existant de ce dépôt ne monte
 * une story de scène par le routeur. La descente du Prisme sur un objet de
 * scène est déjà éprouvée SANS ce problème par
 * `lib/canvas/text.test.ts`/`resolveSceneText` (rang 2, `served()`) et par
 * `routes/story-scene-layer.test.tsx:168-176` (le témoin de rang MODÈLE) ;
 * la composition RENDU + Prisme d'une story de scène (« Original » ⇒ texte
 * espagnol, `lang="es"`) est couverte par le gate NAVIGATEUR
 * `scripts/check-story-languages.mjs` (§ 4.9 point 3), qui tourne sur un
 * VRAI moteur de mise en page (Playwright/Chromium).
 */
