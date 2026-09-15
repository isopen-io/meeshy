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

function writeNativeValue(input: HTMLInputElement, prototype: object | null, value: string): boolean {
  if (prototype === null) return false;
  const setter: unknown = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;
  if (typeof setter !== 'function') return writeNativeValue(input, Object.getPrototypeOf(prototype), value);
  Reflect.apply(setter, input, [value]);
  return true;
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

  const type = (host: ParentNode, selector: string, value: string): void => {
    const input = host.querySelector(selector);
    if (!(input instanceof HTMLInputElement)) throw new Error(`champ absent : ${selector}`);
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

  return { mount, settle, unmountAll, click, type, submit };
}

export const buttonNamed = (host: ParentNode, name: string): HTMLButtonElement | null =>
  [...host.querySelectorAll('button')].find((button) => button.textContent?.trim() === name) ?? null;
