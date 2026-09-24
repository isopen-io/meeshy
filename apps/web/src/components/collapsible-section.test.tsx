import { act } from 'react';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import { createActMounter } from '@/test-support/act-mount';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { CollapsibleSection } from './collapsible-section';

/**
 * **LA SECTION REPLIABLE** (#6862, lot C).
 *
 * Ce que ces témoins gardent :
 *
 * 1. **Le titre est un BOUTON.** Un `<div onClick>` aurait le même effet à la
 *    souris et AUCUN au clavier — la moitié des lecteurs, silencieusement. Le
 *    témoin le mesure par la TOUCHE, pas par la balise : `Enter` et `Espace`
 *    déclenchent le clic sur un `<button>` et sur rien d'autre.
 * 2. **`aria-expanded` suit l'état.** C'est le SEUL canal par lequel un lecteur
 *    d'écran sait qu'il y a quelque chose sous le titre.
 * 3. **Replié ⇒ les enfants sont DÉMONTÉS.** Laisser les enfants montés sous un
 *    `hidden` ferait tourner leurs requêtes et leurs minuteurs pour un contenu
 *    que personne ne regarde.
 * 4. **Déplié PAR DÉFAUT.** Ces sections sont le contenu de l'écran ; les
 *    replier ferait payer un geste au chemin nominal.
 */

const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };

beforeAll(() => {
  ensureHappyDomRegistered();
  globals.IS_REACT_ACT_ENVIRONMENT = true;
});

afterAll(async () => {
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
});

const mounter = createActMounter();
afterEach(() => mounter.unmountAll());

const bascule = (host: ParentNode): HTMLButtonElement => {
  const bouton = host.querySelector('[data-collapsible-toggle="s"]');
  if (!(bouton instanceof HTMLButtonElement)) throw new Error('la bascule n’est pas un <button>');
  return bouton;
};

/** Une touche RÉELLE, pas un `.click()` : c'est le comportement natif du
 * `<button>` qu'on mesure, celui qu'un `<div>` n'aurait pas. */
const appuie = async (element: HTMLElement, key: string): Promise<void> => {
  await act(async () => {
    element.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
    element.dispatchEvent(new KeyboardEvent('keyup', { key, bubbles: true, cancelable: true }));
    // happy-dom n'active pas le bouton sur la touche : le navigateur le fait,
    // et c'est ce qu'on simule ici — le contrat mesuré reste « un élément
    // ACTIVABLE au clavier », que seul un `<button>` (ou un rôle + gestion
    // manuelle, absente ici) honore.
    if (element instanceof HTMLButtonElement && (key === 'Enter' || key === ' ')) element.click();
  });
};

describe('CollapsibleSection — le titre est un geste', () => {
  test('DÉPLIÉE par défaut : le contenu est là sans qu’on ait rien à faire', async () => {
    const host = await mounter.mount(
      <CollapsibleSection id="s" title="Conversations">
        <p data-contenu>ce qu’on vient voir</p>
      </CollapsibleSection>,
    );

    expect(bascule(host).getAttribute('aria-expanded')).toBe('true');
    expect(host.querySelector('[data-contenu]')).not.toBe(null);
  });

  test('`defaultOpen={false}` la rend repliée — et les enfants sont DÉMONTÉS, pas cachés', async () => {
    const host = await mounter.mount(
      <CollapsibleSection id="s" title="Conversations" defaultOpen={false}>
        <p data-contenu>ce qu’on vient voir</p>
      </CollapsibleSection>,
    );

    expect(bascule(host).getAttribute('aria-expanded')).toBe('false');
    expect(host.querySelector('[data-contenu]')).toBe(null);
  });

  test('SE PLIE ET SE DÉPLIE À LA SOURIS', async () => {
    const host = await mounter.mount(
      <CollapsibleSection id="s" title="Conversations">
        <p data-contenu>ce qu’on vient voir</p>
      </CollapsibleSection>,
    );

    await mounter.click(bascule(host));
    expect(bascule(host).getAttribute('aria-expanded')).toBe('false');
    expect(host.querySelector('[data-contenu]')).toBe(null);

    await mounter.click(bascule(host));
    expect(bascule(host).getAttribute('aria-expanded')).toBe('true');
    expect(host.querySelector('[data-contenu]')).not.toBe(null);
  });

  test('SE PLIE ET SE DÉPLIE AU CLAVIER — Entrée puis Espace', async () => {
    const host = await mounter.mount(
      <CollapsibleSection id="s" title="Conversations">
        <p data-contenu>ce qu’on vient voir</p>
      </CollapsibleSection>,
    );

    await appuie(bascule(host), 'Enter');
    expect(bascule(host).getAttribute('aria-expanded')).toBe('false');

    await appuie(bascule(host), ' ');
    expect(bascule(host).getAttribute('aria-expanded')).toBe('true');
    expect(host.querySelector('[data-contenu]')).not.toBe(null);
  });

  test('le panneau que `aria-controls` désigne EXISTE — sinon l’attribut ne relie rien', async () => {
    const host = await mounter.mount(
      <CollapsibleSection id="s" title="Conversations" defaultOpen={false}>
        <p data-contenu>ce qu’on vient voir</p>
      </CollapsibleSection>,
    );

    const cible = bascule(host).getAttribute('aria-controls');
    expect(cible).toBe('s-panel');
    // REPLIÉE : le panneau est toujours dans le document, seulement `hidden`.
    expect(host.querySelector('#s-panel')).not.toBe(null);
  });

  test('la cible du geste fait au moins 44 px — dimension 5', async () => {
    const host = await mounter.mount(
      <CollapsibleSection id="s" title="Conversations">
        <p />
      </CollapsibleSection>,
    );
    expect(bascule(host).style.minHeight).toBe('44px');
  });

  test('la section est NOMMÉE par son titre — `aria-labelledby` pointe le bon nœud', async () => {
    const host = await mounter.mount(
      <CollapsibleSection id="s" title="Conversations">
        <p />
      </CollapsibleSection>,
    );
    const section = host.querySelector('section');
    expect(section?.getAttribute('aria-labelledby')).toBe('s-title');
    expect(host.querySelector('#s-title')?.textContent).toContain('Conversations');
  });
});
