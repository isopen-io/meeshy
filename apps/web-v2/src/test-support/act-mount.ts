import { act, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';

/**
 * MONTER UN ÉCRAN, LE LAISSER RÉPONDRE, LE TOUCHER (#6714, #6715).
 *
 * Les écrans des liens reçus appellent la passerelle dans un EFFET puis
 * posent leur état à la réponse : un témoin qui lirait le DOM juste après le
 * rendu verrait toujours l'état de chargement. `settle` laisse passer un tour
 * de boucle sous `act`, ce qui suffit à des dépendances qui répondent par une
 * promesse déjà résolue.
 *
 * `type` écrit par le SETTER NATIF de `value`, cherché sur la chaîne de
 * prototypes DE L'ÉLÉMENT. React pose son suivi de valeur sur l'instance :
 * une affectation directe met ce suivi à jour, React ne voit alors aucun
 * changement à l'événement `input` et ne rappelle pas `onChange`. Sous
 * happy-dom, le global `HTMLInputElement.prototype` n'est pas sur cette
 * chaîne : y chercher le setter ne trouvait rien, et le champ restait vide.
 */

function writeNativeValue(input: HTMLElement, prototype: object | null, value: string): boolean {
  if (prototype === null) return false;
  const setter: unknown = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;
  if (typeof setter !== 'function') return writeNativeValue(input, Object.getPrototypeOf(prototype), value);
  Reflect.apply(setter, input, [value]);
  return true;
}

/**
 * SAISIR DANS UN CHAMP, hors du mouleur — pour un témoin qui monte ses écrans
 * lui-même (`routes/chat-join.test.tsx`) et n'a pas besoin du reste.
 *
 * EXPOSÉ plutôt que recopié : cette fonction porte deux pièges déjà payés — le
 * setter natif cherché sur la chaîne de prototypes DE L'ÉLÉMENT (le global
 * `HTMLInputElement.prototype` n'y est pas sous happy-dom), et un `act`
 * SYNCHRONE, sans lequel React ne rejoue pas le rendu avant la lecture qui
 * suit. Une troisième écriture de la même règle aurait divergé au premier
 * témoin qui n'en relit qu'une.
 *
 * `change` en plus d'`input` : c'est `change` que React écoute sur un `<select>`.
 *
 * PAS DE `<textarea>` ICI, et c'est mesuré (#6862) : l'ordre de cette fonction
 * — affectation DIRECTE d'abord — met à jour le suivi de valeur de React, qui
 * ne voit alors AUCUN changement à l'événement `input` et ne rappelle pas
 * `onChange`. Le champ paraît rempli (`element.value` vaut la valeur, donc la
 * garde ci-dessous ne lève pas) et le composant reste vide. Une `<textarea>`
 * passe par `createActMounter().type`, dont l'ordre est l'inverse.
 */
export function typeInto(element: HTMLInputElement | HTMLSelectElement | null, value: string): void {
  if (element === null) throw new Error('champ absent');
  act(() => {
    /* AFFECTATION DIRECTE d'abord — c'est l'idiome du dépôt
       (`composer.test.tsx`, `login-next.test.tsx`), et le SEUL qui fonctionne
       sur un `<select>` sous happy-dom : le setter natif y refuse une valeur
       pourtant présente dans les options. Le setter natif ne sert que de
       repli, pour un élément dont l'affectation ne prendrait pas. */
    element.value = value;
    if (element.value !== value) writeNativeValue(element, Object.getPrototypeOf(element), value);
    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
  });
  if (element.value !== value) throw new Error(`le champ n’a pas reçu « ${value} »`);
}

export function createActMounter() {
  const mounted: Array<{ readonly root: Root; readonly host: HTMLDivElement }> = [];

  const settle = async (): Promise<void> => {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  };

  const mount = async (element: ReactElement): Promise<HTMLDivElement> => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    mounted.push({ root, host });
    await act(async () => {
      root.render(element);
    });
    await settle();
    return host;
  };

  /**
   * REND À NOUVEAU DANS LA MÊME RACINE (#6862, revue-correction) — un
   * `mount` de plus créerait un second arbre, où tout `useMemo` repart de
   * zéro : on ne mesurerait plus ce que React GARDE d'un rendu à l'autre, mais
   * deux montages indépendants.
   */
  const rerender = async (host: HTMLDivElement, element: ReactElement): Promise<void> => {
    const monte = mounted.find((entree) => entree.host === host);
    if (monte === undefined) throw new Error('hôte non monté par ce mounter');
    await act(async () => {
      monte.root.render(element);
    });
    await settle();
  };

  const unmountAll = (): void => {
    for (const { root, host } of mounted.splice(0)) {
      act(() => root.unmount());
      host.remove();
    }
  };

  const click = async (element: HTMLElement | null): Promise<void> => {
    if (element === null) throw new Error('élément à toucher absent');
    await act(async () => {
      element.click();
    });
    await settle();
  };

  /** `<input>` ET `<textarea>` : le SETTER NATIF d'abord, seul ordre qui fasse
   * rappeler `onChange` sur un champ contrôlé par React (#6862). */
  const type = (host: ParentNode, selector: string, value: string): void => {
    const input = host.querySelector(selector);
    if (!(input instanceof HTMLInputElement) && !(input instanceof HTMLTextAreaElement)) {
      throw new Error(`champ absent : ${selector}`);
    }
    act(() => {
      if (!writeNativeValue(input, Object.getPrototypeOf(input), value)) throw new Error(`aucun setter natif de value pour ${selector}`);
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    if (input.value !== value) throw new Error(`le champ ${selector} n’a pas reçu « ${value} »`);
  };

  const submit = async (host: ParentNode): Promise<void> => {
    const form = host.querySelector('form');
    if (form === null) throw new Error('formulaire absent');
    await act(async () => {
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });
    await settle();
  };

  return { mount, rerender, settle, unmountAll, click, type, submit };
}

export const buttonNamed = (host: ParentNode, name: string): HTMLButtonElement | null =>
  [...host.querySelectorAll('button')].find((button) => button.textContent?.trim() === name) ?? null;
