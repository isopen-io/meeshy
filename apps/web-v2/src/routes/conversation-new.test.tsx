import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClientProvider } from '@tanstack/react-query';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import { appQueryClient } from '@/lib/api/query-client';
import { typeInto } from '@/test-support/act-mount';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import ConversationNewScreen from './conversation-new';

/**
 * **NOUVELLE CONVERSATION — LES DEUX MODES** (#6706).
 *
 * Ce que les témoins de bibliothèque ne peuvent pas prouver
 * (`lib/conversation-new/group.test.ts` tient la validation et les issues) :
 * qu'un tap fait DEUX choses différentes selon le mode, que la sélection se
 * voit et s'annonce, et qu'un refus se pose sous le champ qu'il vise SANS
 * qu'aucune requête ne parte.
 *
 * **Tout ce qui est mesuré ici précède le réseau.** `validateGroupDraft` court
 * avant l'appel : un titre vide ou une liste vide se refusent sans sortir. La
 * création RÉUSSIE n'est pas jouée ici — sous `bun test` la source est
 * `fixtures`, et `createGroupConversation` y refuse délibérément (501) : un
 * groupe de démonstration n'aurait aucun fil où mener.
 *
 * Le champ de recherche garde son nom accessible EXACT : le gate navigateur
 * (`scripts/check-list-actions.mjs:767`) le cherche par
 * `input[aria-label="Rechercher un contact"]`, et le renommer casserait un gate
 * que ce fichier ne joue pas.
 */

const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };

beforeAll(() => {
  ensureHappyDomRegistered({ url: 'http://localhost/conversations/new' });
  globals.IS_REACT_ACT_ENVIRONMENT = true;
});

afterAll(async () => {
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
});

let mounted: { readonly container: HTMLDivElement; readonly root: Root } | null = null;

afterEach(() => {
  act(() => mounted?.root.unmount());
  mounted?.container.remove();
  mounted = null;
});

const settle = () =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

/**
 * LE CLIENT DE REQUÊTES EST FOURNI PAR LE CONTEXTE, comme dans l'application
 * (`main.tsx`) — l'écran lit `useQueryClient()`, une recherche en `useQuery` et
 * deux `useMutation`, dont aucun ne reçoit le client en argument. Monté nu, il
 * lève « No QueryClient set » avant d'avoir rendu une seule ligne.
 *
 * C'est l'instance PARTAGÉE (`appQueryClient`) et non une instance neuve : la
 * liste des amis vient du cache persisté, et c'est précisément ce que #6705
 * promet — les amis peints dès l'ouverture, sans attente.
 */
async function mount(): Promise<HTMLDivElement> {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  mounted = { container, root };
  await act(async () => {
    root.render(
      <QueryClientProvider client={appQueryClient}>
        <ConversationNewScreen />
      </QueryClientProvider>,
    );
  });
  await settle();
  return container;
}

async function click(element: Element | null | undefined) {
  await act(async () => {
    (element as HTMLElement | null | undefined)?.click();
  });
  await settle();
}

const modeButton = (el: HTMLElement, mode: 'direct' | 'group') =>
  el.querySelector<HTMLButtonElement>(`[data-new-mode="${mode}"]`);
const composer = (el: HTMLElement) => el.querySelector<HTMLFormElement>('[data-group-composer]');
const titleField = (el: HTMLElement) => el.querySelector<HTMLInputElement>('[data-group-title]');
const submit = (el: HTMLElement) => el.querySelector<HTMLButtonElement>('[data-group-submit]');
const chosen = (el: HTMLElement) => el.querySelector('[data-group-chosen]');
const people = (el: HTMLElement) => [...el.querySelectorAll<HTMLButtonElement>('[data-person]')];
const firstPerson = (el: HTMLElement) => people(el)[0] ?? null;
const text = (el: Element | null | undefined) => (el?.textContent ?? '').replace(/\s+/gu, ' ');

async function submitGroup(el: HTMLElement) {
  const form = composer(el);
  if (form === null) throw new Error('composeur de groupe absent');
  await act(async () => {
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  });
  await settle();
}

describe('l’écran s’ouvre en DIRECT', () => {
  test('le champ de recherche garde le nom que le gate navigateur cherche', async () => {
    const el = await mount();
    expect(el.querySelector('input[aria-label="Rechercher un contact"]')).not.toBeNull();
  });

  test('aucun composeur de groupe n’est offert, et « Direct » est pressé', async () => {
    const el = await mount();
    expect(composer(el)).toBeNull();
    expect(modeButton(el, 'direct')?.getAttribute('aria-pressed')).toBe('true');
    expect(modeButton(el, 'group')?.getAttribute('aria-pressed')).toBe('false');
  });

  /* En direct, une rangée OUVRE une conversation : elle ne se déclare pas
     cochable, sans quoi un lecteur d'écran annoncerait un état qui n'existe pas. */
  test('une rangée ne s’annonce PAS cochable', async () => {
    const el = await mount();
    expect(firstPerson(el)?.hasAttribute('aria-pressed')).toBe(false);
  });
});

describe('passer en GROUPE change ce qu’un tap produit', () => {
  test('le composeur paraît, le titre de l’écran suit', async () => {
    const el = await mount();
    await click(modeButton(el, 'group'));
    expect(composer(el)).not.toBeNull();
    expect(text(el.querySelector('h1'))).toBe('Nouveau groupe');
    expect(modeButton(el, 'group')?.getAttribute('aria-pressed')).toBe('true');
  });

  test('chaque rangée devient une case à cocher, et le DIT', async () => {
    const el = await mount();
    await click(modeButton(el, 'group'));
    expect(firstPerson(el)?.getAttribute('aria-pressed')).toBe('false');
  });

  test('toucher quelqu’un le coche, le retoucher le décoche', async () => {
    const el = await mount();
    await click(modeButton(el, 'group'));

    await click(firstPerson(el));
    expect(firstPerson(el)?.getAttribute('aria-pressed')).toBe('true');
    expect(chosen(el)).not.toBeNull();

    await click(firstPerson(el));
    expect(firstPerson(el)?.getAttribute('aria-pressed')).toBe('false');
    expect(chosen(el)).toBeNull();
  });

  /* Le choix se défait LÀ OÙ IL SE VOIT : sans cela, se tromper obligerait à
     remonter la liste pour retrouver la ligne. */
  test('une personne choisie se retire depuis sa pastille', async () => {
    const el = await mount();
    await click(modeButton(el, 'group'));
    await click(firstPerson(el));

    const retrait = el.querySelector<HTMLButtonElement>('[data-group-remove]');
    expect(retrait?.getAttribute('aria-label')).toContain('Retirer');
    await click(retrait);

    expect(chosen(el)).toBeNull();
    expect(firstPerson(el)?.getAttribute('aria-pressed')).toBe('false');
  });

  test('revenir en direct puis au groupe ne perd pas ce qui était choisi', async () => {
    const el = await mount();
    await click(modeButton(el, 'group'));
    await click(firstPerson(el));

    await click(modeButton(el, 'direct'));
    await click(modeButton(el, 'group'));

    expect(firstPerson(el)?.getAttribute('aria-pressed')).toBe('true');
  });
});

describe('un refus se pose sous son champ, et RIEN ne part', () => {
  test('sans titre : le champ est visé et se déclare invalide', async () => {
    const el = await mount();
    await click(modeButton(el, 'group'));
    await click(firstPerson(el));
    await submitGroup(el);

    expect(composer(el)).not.toBeNull();
    expect(titleField(el)?.getAttribute('aria-invalid')).toBe('true');
    const decrit = titleField(el)?.getAttribute('aria-describedby')?.split(' ')[0] ?? '';
    expect(text(el.querySelector(`#${decrit}`))).toContain('nom');
  });

  test('sans personne : c’est la LISTE qui est blâmée, pas le titre', async () => {
    const el = await mount();
    await click(modeButton(el, 'group'));
    typeInto(titleField(el), 'Équipe déploiement');
    await settle();
    await submitGroup(el);

    expect(titleField(el)?.getAttribute('aria-invalid')).toBe('false');
    expect(text(el.querySelector('[role="alert"]'))).toContain('au moins une personne');
  });

  test('corriger le champ visé efface son refus', async () => {
    const el = await mount();
    await click(modeButton(el, 'group'));
    await click(firstPerson(el));
    await submitGroup(el);
    expect(titleField(el)?.getAttribute('aria-invalid')).toBe('true');

    typeInto(titleField(el), 'Équipe');
    await settle();
    expect(titleField(el)?.getAttribute('aria-invalid')).toBe('false');
  });

  /* Choisir quelqu'un répare le refus de la LISTE — le geste qui corrige est
     celui qui efface le message, jamais un second envoi. */
  test('choisir quelqu’un efface le refus de la liste', async () => {
    const el = await mount();
    await click(modeButton(el, 'group'));
    typeInto(titleField(el), 'Équipe');
    await settle();
    await submitGroup(el);
    expect(el.querySelector('[role="alert"]')).not.toBeNull();

    await click(firstPerson(el));
    expect(el.querySelector('[role="alert"]')).toBeNull();
  });

  test('le bouton nomme le geste, et reste actionnable après un refus', async () => {
    const el = await mount();
    await click(modeButton(el, 'group'));
    await submitGroup(el);

    expect(text(submit(el))).toBe('Créer le groupe');
    expect(submit(el)?.disabled).toBe(false);
  });
});
