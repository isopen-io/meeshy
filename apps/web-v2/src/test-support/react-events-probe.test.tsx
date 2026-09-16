import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from './happy-dom-environment';

/**
 * **UN GESTE ATTEINT-IL SON GESTIONNAIRE ?** — sonde de TECHNIQUE, pas de
 * produit.
 *
 * Elle existe parce qu'un témoin d'écran (`routes/chat-join-guest.test.tsx`)
 * a montré qu'AUCUN gestionnaire React ne se déclenchait — ni `onChange`, ni
 * `onFocus` — alors que l'affectation DOM pure fonctionnait, et que d'autres
 * témoins du dépôt (`routes/login-next.test.tsx`, `routes/forgot-password.test.tsx`)
 * font exactement les mêmes gestes et passent.
 *
 * Ce fichier ne monte RIEN du produit et n'importe rien d'autre que
 * l'enregistrement du DOM : si ses sondes passent, la technique est valide et
 * c'est le témoin d'écran qui a un défaut propre ; si elles échouent, c'est la
 * technique qu'il faut remplacer partout, et les témoins qui « passent »
 * ailleurs ne mesurent pas ce qu'ils annoncent.
 */

const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };

beforeAll(() => {
  ensureHappyDomRegistered({ url: 'http://localhost/sonde' });
  globals.IS_REACT_ACT_ENVIRONMENT = true;
});

afterAll(async () => {
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
});

let container: HTMLDivElement;
let root: Root;

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

function mount(element: Parameters<Root['render']>[0]): HTMLDivElement {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root.render(element);
  });
  return container;
}

describe('la technique de saisie du dépôt, sur un arbre NU', () => {
  /**
   * **LE PIÈGE, GRAVÉ** — mesuré le 2026-09-16 sur cet arbre nu : un événement
   * `input` dispatché déclenche `onInput`, et **PAS** `onChange`.
   *
   * React fait normalement de `onChange` un synonyme de l'événement `input`
   * pour un champ texte ; cette équivalence repose sur son suivi de valeur, que
   * happy-dom ne satisfait pas. Un champ câblé en `onChange` se monte, se
   * remplit à l'œil, et ne rapporte JAMAIS rien à son hôte — sans qu'aucun
   * témoin d'écran ne puisse dire pourquoi, puisque le DOM, lui, est juste.
   *
   * C'est exactement ce qui a fait échouer `routes/chat-join.test.tsx` (#5561)
   * pendant tout un lot. La convention du dépôt — `onInput` sur les champs
   * texte (`components/composer.tsx:569`) — n'est donc pas un goût : c'est la
   * seule qui fonctionne ici.
   *
   * Ce témoin garde le PIÈGE, pas un souhait. Le jour où happy-dom ou React
   * rendent `onChange` équivalent, il rougira — et ce sera la bonne nouvelle
   * qu'il faut lire, pas un échec à faire taire.
   */
  test('`onChange` d’un `<input>` NE reçoit PAS un `input` dispatché — le piège', () => {
    const vus: string[] = [];
    const host = mount(<input data-sonde onChange={(event) => vus.push(event.currentTarget.value)} />);
    const champ = host.querySelector<HTMLInputElement>('[data-sonde]');
    act(() => {
      if (champ !== null) champ.value = 'x';
      champ?.dispatchEvent(new Event('input', { bubbles: true }));
    });
    expect(vus).toEqual([]);
  });

  test('`onChange` d’un `<select>` reçoit bien un `change` dispatché', () => {
    const vus: string[] = [];
    const host = mount(
      <select data-sonde defaultValue="fr" onChange={(event) => vus.push(event.currentTarget.value)}>
        <option value="fr">fr</option>
        <option value="en">en</option>
      </select>,
    );
    const champ = host.querySelector<HTMLSelectElement>('[data-sonde]');
    act(() => {
      if (champ !== null) champ.value = 'en';
      champ?.dispatchEvent(new Event('change', { bubbles: true }));
    });
    expect(vus).toEqual(['en']);
  });

  test('`onInput` d’un `<input>` non contrôlé', () => {
    const vus: string[] = [];
    const host = mount(<input data-sonde onInput={(event) => vus.push(event.currentTarget.value)} />);
    const champ = host.querySelector<HTMLInputElement>('[data-sonde]');
    act(() => {
      if (champ !== null) champ.value = 'y';
      champ?.dispatchEvent(new Event('input', { bubbles: true }));
    });
    expect(vus).toEqual(['y']);
  });

  test('`onClick` d’un `<button>` — le geste le plus simple qui soit', () => {
    const vus: number[] = [];
    const host = mount(<button type="button" data-sonde onClick={() => vus.push(1)} />);
    act(() => {
      host.querySelector<HTMLButtonElement>('[data-sonde]')?.click();
    });
    expect(vus).toEqual([1]);
  });

  test('`onSubmit` d’un `<form>`', () => {
    const vus: number[] = [];
    const host = mount(
      <form
        data-sonde
        onSubmit={(event) => {
          event.preventDefault();
          vus.push(1);
        }}
      />,
    );
    act(() => {
      host.querySelector('[data-sonde]')?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });
    expect(vus).toEqual([1]);
  });

  test('le RENDU lui-même arrive — pour distinguer « rien ne se monte » de « rien ne s’écoute »', () => {
    const host = mount(<input data-sonde defaultValue="posé" />);
    expect(host.querySelector<HTMLInputElement>('[data-sonde]')?.value).toBe('posé');
  });
});
