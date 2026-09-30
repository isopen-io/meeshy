import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';
import { act } from 'react';

import { loadInterfaceCatalog } from '@/lib/i18n-catalog';
import { createActMounter } from '@/test-support/act-mount';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { StoryOptionsMenu } from './story-options-menu';

/**
 * **LE MENU (…) DU LECTEUR DE STORIES** (#8823) — miroir du `Menu` à
 * `ellipsis` de `StoryViewerView+Header.swift`. Demande porteur 2026-09-30 :
 * « Enregistrer » y appelle la sauvegarde EXISTANTE, pour TOUT lecteur. Le
 * menu ne sait pas enregistrer : il reçoit le geste de l'hôte
 * (`useStoryOwnerRail().handlers.save`) et le déclenche.
 */
const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
const { mount, unmountAll } = createActMounter();

beforeAll(async () => {
  ensureHappyDomRegistered();
  globals.IS_REACT_ACT_ENVIRONMENT = true;
  await loadInterfaceCatalog('fr');
});

afterAll(async () => {
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
});

afterEach(() => {
  unmountAll();
});

const trigger = () => document.querySelector<HTMLButtonElement>('[data-story-options]');
const saveItem = () => document.querySelector<HTMLButtonElement>('[role="menuitem"][data-story-option="save"]');
const press = (element: HTMLElement | null) =>
  act(() => {
    element?.click();
  });

describe('le menu (…) d’une story (#8823)', () => {
  test('« Enregistrer » appelle la sauvegarde que l’hôte lui remet', async () => {
    const calls: string[] = [];
    await mount(<StoryOptionsMenu language="fr" onSave={() => calls.push('save')} />);
    expect(trigger()?.getAttribute('aria-haspopup')).toBe('menu');
    await press(trigger());
    expect(saveItem()?.textContent).toContain('Enregistrer');
    await press(saveItem());
    expect(calls).toEqual(['save']);
    expect(saveItem()).toBeNull();
  });

  test('ouvrir le menu met la story en pause, le refermer la reprend', async () => {
    const states: boolean[] = [];
    await mount(<StoryOptionsMenu language="fr" onSave={() => undefined} onOpenChange={(open) => states.push(open)} />);
    await press(trigger());
    await press(saveItem());
    expect(states).toEqual([true, false]);
  });

  test('loi 4 — rien à faire, aucun bouton : une story sans média exportable n’offre pas le menu', async () => {
    await mount(<StoryOptionsMenu language="fr" />);
    expect(trigger()).toBeNull();
  });
});
