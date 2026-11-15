import { QueryClientProvider } from '@tanstack/react-query';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import { appQueryClient } from '@/lib/api/query-client';
import { fixtureMoods } from '@/lib/api/status';
import { loadInterfaceCatalog } from '@/lib/i18n-catalog';
import { loadMoodComposeCatalog } from '@/lib/i18n-mood-compose-catalog';
import { EXTENDED_REACTIONS } from '@/lib/view/message-actions';
import StatusComposeScreen, { MOOD_CHOICES } from '@/routes/status-compose';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

/**
 * **L'ÉCRAN DE CRÉATION D'UNE HUMEUR** (#10527), vu de l'auteur :
 *
 * 1. valider sans un mot DEMANDE, et rien ne part tant qu'on n'a pas répondu ;
 * 2. les deux réponses tiennent en UN geste — revenir au champ, ou publier ;
 * 3. une icône ouvre la feuille d'emojis du dépôt (celle des réactions et du
 *    composeur), et l'emoji choisi devient celui de l'humeur.
 */
const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };

beforeAll(async () => {
  ensureHappyDomRegistered();
  globals.IS_REACT_ACT_ENVIRONMENT = true;
  await loadInterfaceCatalog('fr');
  await loadMoodComposeCatalog('fr');
});

afterAll(async () => {
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
});

let container: HTMLDivElement;
let root: Root;

afterEach(() => {
  act(() => {
    root.unmount();
  });
  container.remove();
  appQueryClient.clear();
});

async function mount(): Promise<HTMLDivElement> {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root.render(
      <QueryClientProvider client={appQueryClient}>
        <StatusComposeScreen />
      </QueryClientProvider>,
    );
  });
  return container;
}

async function settle(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 30));
  });
}

function required<T extends Element>(el: ParentNode, selector: string): T {
  const found = el.querySelector<T>(selector);
  if (found === null) throw new Error(`absent : ${selector}`);
  return found;
}

function click(el: ParentNode, selector: string): void {
  act(() => {
    required<HTMLElement>(el, selector).click();
  });
}

function typeNote(el: ParentNode, value: string): void {
  const field = required<HTMLInputElement>(el, '[data-mood-note]');
  act(() => {
    field.focus();
    field.value = value;
    field.setSelectionRange(value.length, value.length);
    field.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

const CHOICE = MOOD_CHOICES[1] ?? '';
const pick = (el: ParentNode): void => click(el, `[data-mood-choice="${CHOICE}"]`);

describe('valider une humeur sans un mot', () => {
  test('demande avant de publier, et rien ne part', async () => {
    const el = await mount();
    const before = fixtureMoods().length;
    pick(el);
    click(el, '[data-mood-publish]');
    await settle();

    const ask = required<HTMLElement>(el, '[data-mood-bare]');
    expect(ask.getAttribute('role')).toBe('alertdialog');
    expect(ask.textContent).toContain('Publier votre humeur sans un petit mot ?');
    expect(fixtureMoods().length).toBe(before);
  });

  test('« Ajouter un mot » referme la question et rend le focus au champ', async () => {
    const el = await mount();
    const before = fixtureMoods().length;
    pick(el);
    click(el, '[data-mood-publish]');
    click(el, '[data-mood-bare-add]');
    await settle();

    expect(el.querySelector('[data-mood-bare]')).toBeNull();
    expect(document.activeElement).toBe(required<HTMLInputElement>(el, '[data-mood-note]'));
    expect(fixtureMoods().length).toBe(before);
  });

  test('« Publier quand même » publie l’humeur, en un geste', async () => {
    const el = await mount();
    const before = fixtureMoods().length;
    pick(el);
    click(el, '[data-mood-publish]');
    click(el, '[data-mood-bare-publish]');
    await settle();

    expect(fixtureMoods().length).toBe(before + 1);
    expect(fixtureMoods()[0]?.moodEmoji).toBe(CHOICE);
  });

  test('avec un mot, publier ne demande rien', async () => {
    const el = await mount();
    const before = fixtureMoods().length;
    pick(el);
    typeNote(el, 'en forme');
    click(el, '[data-mood-publish]');
    await settle();

    expect(el.querySelector('[data-mood-bare]')).toBeNull();
    expect(fixtureMoods().length).toBe(before + 1);
  });

  test('écrire un mot pendant la question la retire d’elle-même', async () => {
    const el = await mount();
    pick(el);
    click(el, '[data-mood-publish]');
    typeNote(el, 'un mot');

    expect(el.querySelector('[data-mood-bare]')).toBeNull();
    expect(el.querySelector('[data-mood-publish]')).not.toBeNull();
  });

  test('les deux réponses sont des cibles de 44 points', async () => {
    const el = await mount();
    pick(el);
    click(el, '[data-mood-publish]');

    for (const selector of ['[data-mood-bare-add]', '[data-mood-bare-publish]']) {
      expect(required<HTMLElement>(el, selector).style.minHeight).toBe('44px');
    }
  });
});

describe('choisir un autre emoji que ceux proposés', () => {
  test('l’icône est nommée pour le lecteur d’écran et fait 44 points', async () => {
    const el = await mount();
    const more = required<HTMLButtonElement>(el, '[data-mood-more]');

    expect(more.getAttribute('aria-label')).toBe('Autres emojis');
    expect(more.getAttribute('aria-haspopup')).toBe('dialog');
    expect(more.style.minHeight).toBe('44px');
    expect(more.style.minWidth).toBe('44px');
  });

  test('elle ouvre la feuille d’emojis du dépôt, et l’emoji choisi devient celui de l’humeur', async () => {
    const el = await mount();
    const outside = EXTENDED_REACTIONS.find((emoji) => !MOOD_CHOICES.includes(emoji)) ?? '';
    expect(outside).not.toBe('');

    click(el, '[data-mood-more]');
    await settle();
    const sheet = required<HTMLElement>(document.body, 'dialog');
    expect(sheet.textContent).toContain('Autres emojis');
    click(sheet, `button[aria-label="${outside}"]`);
    await settle();

    expect(document.body.querySelector('dialog')).toBeNull();
    expect(required<HTMLElement>(el, '[data-mood-preview]').textContent).toBe(outside);

    const before = fixtureMoods().length;
    typeNote(el, 'autre chose');
    click(el, '[data-mood-publish]');
    await settle();
    expect(fixtureMoods().length).toBe(before + 1);
    expect(fixtureMoods()[0]?.moodEmoji).toBe(outside);
  });
});
