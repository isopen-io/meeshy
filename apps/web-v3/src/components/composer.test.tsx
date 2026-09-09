import { GlobalRegistrator } from '@happy-dom/global-registrator';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import { Composer } from './composer';

/**
 * LA CITATION PRÉ-ADRESSÉE DIT SA LANGUE (revue #5695) — `replyTo.excerpt`
 * est servi par le PRISME (`served()`, `routes/thread.tsx`), donc il peut
 * être dans une langue AUTRE que celle du document. Le témoin est écrit sur
 * une langue autre que le français (leçon 261 : un témoin de rang ne se
 * pose jamais sur le rang qui rendrait le même verdict par accident).
 */
describe('Composer — la citation porte la langue dans laquelle elle est SERVIE', () => {
  test('replyTo.language pose lang sur l’extrait', () => {
    const html = renderToStaticMarkup(
      <Composer onSend={() => {}} replyTo={{ author: 'Amina', excerpt: 'Do you confirm the mockup?', language: 'en' }} />,
    );
    expect(html).toContain('lang="en"');
    expect(html).toContain('Do you confirm the mockup?');
  });

  test('sans langue servie, aucun lang n’est posé — jamais un « fr » fabriqué', () => {
    const html = renderToStaticMarkup(
      <Composer onSend={() => {}} replyTo={{ author: 'Amina', excerpt: 'Tu valides la maquette ?' }} />,
    );
    expect(html).not.toContain('lang=');
  });

  test('sans citation, aucun bloc de réponse n’est monté', () => {
    const html = renderToStaticMarkup(<Composer onSend={() => {}} />);
    expect(html).not.toContain('data-composer-reply');
  });
});

/**
 * LE FOCUS APRÈS UN ENVOI AU DOIGT (revue-correction #5813, défaut majeur 8)
 * — SANS ce témoin, le mécanisme (`onPointerDown` + `preventDefault` sur le
 * bouton d'envoi, puis `field.current.focus()` de rattrapage dans `send()`)
 * peut être retiré par un futur diff sans qu'aucun test ne rougisse : c'est
 * exactement la forme « un vert des deux côtés du diff mesure la machine, pas
 * le diff » (`tasks/lessons.md`). `renderToStaticMarkup` ne produit aucun
 * `document` — impossible d'y observer un focus — d'où un DOM RÉEL
 * (happy-dom, enregistré globalement pour ce bloc SEULEMENT) et un rendu
 * CLIENT (`react-dom/client`), jamais un rendu statique.
 *
 * Le second cas protège la coque iOS dans le moteur des tests, en attendant
 * la capture WKWebView (revue-correction #5813, défaut majeur 2) : il épingle
 * que le `click` du bouton d'envoi part bel et bien MALGRÉ le
 * `preventDefault()` posé sur `pointerdown` — la forme exacte qui, dans
 * WKWebView, a par le passé rendu un bouton INERTE quand l'annulation de
 * `pointerdown` supprimait aussi le `click` qui devait le suivre.
 */
describe('Composer — le focus après un envoi au doigt (revue-correction #5813, défaut majeur 8)', () => {
  // React n'avertit sur `act(...)` que si ce fanion global est absent — la
  // TYPE globale n'existe nulle part au dépôt (aucun autre test ne rend en
  // client), donc on la porte ici plutôt que d'écrire un `any`.
  const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };

  beforeAll(() => {
    GlobalRegistrator.register();
    globals.IS_REACT_ACT_ENVIRONMENT = true;
  });

  afterAll(async () => {
    delete globals.IS_REACT_ACT_ENVIRONMENT;
    await GlobalRegistrator.unregister();
  });

  let container: HTMLDivElement;
  let root: Root;

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  const mount = (onSend: (text: string) => void) => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    act(() => {
      root.render(<Composer onSend={onSend} />);
    });
    return container;
  };

  const type = (field: HTMLTextAreaElement, value: string) => {
    act(() => {
      field.value = value;
      field.dispatchEvent(new Event('input', { bubbles: true }));
    });
  };

  // Reproduit EXACTEMENT le geste au doigt sur mobile : `pointerdown` PUIS
  // `click` — jamais `mousedown`, que rien dans `composer.tsx` n'écoute.
  // Rend l'événement `pointerdown` DISPATCHÉ : c'est lui qui dit si
  // `e.preventDefault()` a bien été appelé (`event.defaultPrevented`).
  const tap = (button: Element): PointerEvent => {
    const down = new PointerEvent('pointerdown', { bubbles: true, cancelable: true });
    act(() => {
      button.dispatchEvent(down);
      button.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    });
    return down;
  };

  /**
   * happy-dom, à la différence d'un navigateur réel, ne déplace PAS
   * automatiquement le focus vers un bouton au `pointerdown` — impossible
   * donc d'observer ici le VOL de focus que `preventDefault()` empêche dans
   * WKWebView. Ce que ce témoin PEUT prouver, et prouve : le champ n'a jamais
   * reçu le focus par un autre chemin dans cet environnement, donc si
   * `document.activeElement === field` après l'envoi, c'est UNIQUEMENT parce
   * que `send()` l'a explicitement redonné (`field.current.focus()`) — la
   * ligne que le défaut majeur 8 protège. Retirer cette ligne fait échouer ce
   * test (vérifié en local avant ce commit) ; retirer `onPointerDown` seul ne
   * le fait PAS, d'où le témoin séparé ci-dessous sur `defaultPrevented`.
   */
  test('après un tap sur le bouton d’envoi, le champ REÇOIT le focus (rattrapage de `send()`)', () => {
    const el = mount(() => {});
    const field = el.querySelector<HTMLTextAreaElement>('[aria-label="Écrire un message"]')!;
    type(field, 'Bonjour');
    expect(document.activeElement).not.toBe(field);
    const sendButton = el.querySelector<HTMLButtonElement>('[aria-label="Envoyer"]')!;

    tap(sendButton);

    expect(document.activeElement).toBe(field);
  });

  /**
   * Épingle le PREMIER des deux mécanismes du défaut majeur 8 : le bouton
   * d'envoi appelle bien `e.preventDefault()` sur `pointerdown` — sans quoi,
   * dans un navigateur réel (WKWebView compris), le `pointerdown` non
   * empêché déplacerait le focus vers le bouton une image avant que `send()`
   * ne le redonne au champ (le clignotement que le défaut décrit).
   */
  test('le `pointerdown` du bouton d’envoi est empêché (`preventDefault`)', () => {
    const el = mount(() => {});
    const field = el.querySelector<HTMLTextAreaElement>('[aria-label="Écrire un message"]')!;
    type(field, 'Bonjour');
    const sendButton = el.querySelector<HTMLButtonElement>('[aria-label="Envoyer"]')!;

    const down = tap(sendButton);

    expect(down.defaultPrevented).toBe(true);
  });

  /**
   * Épingle le SECOND mécanisme : malgré ce `preventDefault()` sur
   * `pointerdown`, le `click` qui suit atteint bien `onSend` — c'est le
   * témoin qui protège la coque iOS (revue-correction #5813, défaut majeur
   * 2) dans le moteur des tests, en attendant la capture WKWebView : un futur
   * diff qui casserait cet enchaînement (ex. un `stopPropagation` posé sur
   * `pointerdown`) romprait le bouton d'envoi SANS qu'aucun autre témoin ne
   * le voie.
   */
  test('l’envoi part quand même — le `click` survit au `preventDefault` de `pointerdown`', () => {
    let sent: string | undefined;
    const el = mount((text) => {
      sent = text;
    });
    const field = el.querySelector<HTMLTextAreaElement>('[aria-label="Écrire un message"]')!;
    type(field, 'Bonjour');
    const sendButton = el.querySelector<HTMLButtonElement>('[aria-label="Envoyer"]')!;

    const down = tap(sendButton);

    expect(down.defaultPrevented).toBe(true);
    expect(sent).toBe('Bonjour');
  });
});
