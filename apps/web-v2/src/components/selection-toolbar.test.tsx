import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';
import { loadInterfaceCatalog } from '@/lib/i18n-catalog';
import { SelectionToolbar } from './selection-toolbar';

/* La barre LIT son catalogue de façon synchrone (#7555) : sans cette charge,
   le rendu jette — contrat de `i18n-catalog.ts`. Le DOM est enregistré ici
   aussi parce que `currentInterfaceLanguage()` lit `document.documentElement.lang`. */
beforeAll(async () => {
  ensureHappyDomRegistered();
  await Promise.all([loadInterfaceCatalog('fr'), loadInterfaceCatalog('en'), loadInterfaceCatalog('ar')]);
});

afterEach(() => {
  document.documentElement.lang = 'fr';
});

describe('SelectionToolbar — rendu (T13)', () => {
  test('1 sélectionné ⇒ pas de compteur', () => {
    const html = renderToStaticMarkup(<SelectionToolbar count={1} onEnd={() => {}} onCopy={() => {}} onForward={() => {}} />);
    expect(html).not.toContain('sélectionnés');
  });

  test('2 sélectionnés ⇒ « 2 sélectionnés »', () => {
    const html = renderToStaticMarkup(<SelectionToolbar count={2} onEnd={() => {}} onCopy={() => {}} onForward={() => {}} />);
    expect(html).toContain('2 sélectionnés');
  });

  test('`role="toolbar"` posé, cibles ≥ 44 px', () => {
    const html = renderToStaticMarkup(<SelectionToolbar count={3} onEnd={() => {}} onCopy={() => {}} onForward={() => {}} />);
    expect(html).toContain('role="toolbar"');
    expect(html).toContain('44');
  });
});

const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };

/**
 * LA BARRE DANS LA LANGUE DU LECTEUR (#7555) — témoin de RANG sur une locale
 * NON française (leçon 261) : en `fr`, un libellé EN DUR et une clé de
 * catalogue rendent le même verdict, et les trois témoins de rendu ci-dessus
 * seraient restés verts sur la barre française servie à un anglophone.
 */
describe('SelectionToolbar — les libellés viennent du catalogue (#7555)', () => {
  test('interface EN ⇒ Cancel, « 2 selected », Copy, et un rôle nommé en anglais', () => {
    document.documentElement.lang = 'en';
    const html = renderToStaticMarkup(<SelectionToolbar count={2} onEnd={() => {}} onCopy={() => {}} onForward={() => {}} />);
    expect(html).toContain('Cancel');
    expect(html).toContain('2 selected');
    expect(html).toContain('Copy');
    expect(html).toContain('aria-label="Message selection"');
    expect(html).not.toContain('Annuler');
    expect(html).not.toContain('sélectionnés');
  });

  /**
   * L'ARABE MET LE NOMBRE APRÈS LE VERBE. Le français dit « 3 sélectionnés »,
   * l'arabe « تم تحديد 3 » : c'est exactement ce qu'un paramètre NOMMÉ achète
   * et qu'une concaténation au site d'appel (`${count} …`) ne peut pas dire.
   * Le témoin porte donc sur l'ORDRE, mesuré sur le texte rendu — et pas sur
   * la forme des chiffres, que le système de numération d'ICU peut rendre
   * latine ou arabe selon la version : une chose qui varie avec la machine
   * n'est pas ce que ce lot garantit.
   */
  test('interface AR ⇒ le verbe d’abord, le nombre ensuite', () => {
    document.documentElement.lang = 'ar';
    const html = renderToStaticMarkup(<SelectionToolbar count={3} onEnd={() => {}} onCopy={() => {}} onForward={() => {}} />);
    const counter = /<span[^>]*>([^<]*)<\/span>/.exec(html)?.[1] ?? '';
    expect(counter.startsWith('تم تحديد')).toBe(true);
    expect(/[0-9٠-٩]$/.test(counter.trim())).toBe(true);
    expect(html).toContain('إلغاء');
    expect(html).not.toContain('Annuler');
  });
});

describe('SelectionToolbar — « Transférer », la seconde porte (#5866)', () => {
  // Le gate navigateur vise `data-*`, jamais le mot : la CI tourne en en-US, et
  // un marqueur épinglé sur un libellé français rougirait sur une barre pourtant
  // correcte (#7141). Le mot, lui, est couvert par les témoins de langue
  // ci-dessus — celui-ci garde le MARQUEUR et la présence du bouton.
  test('le bouton est là, et il porte le marqueur que les gates visent', () => {
    const html = renderToStaticMarkup(
      <SelectionToolbar count={2} onEnd={() => {}} onCopy={() => {}} onForward={() => {}} />,
    );
    expect(html).toContain('data-selection-forward');
    expect(html).toContain('Transférer');
  });
});

describe('SelectionToolbar — effets (T13)', () => {
  beforeAll(() => {
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

  const mount = (props: { onEnd: () => void; onCopy: () => void }): HTMLDivElement => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    act(() => {
      root.render(<SelectionToolbar count={2} {...props} onForward={() => {}} />);
    });
    return container;
  };

  test('Annuler ⇒ onEnd', () => {
    let ended = false;
    const el = mount({ onEnd: () => (ended = true), onCopy: () => {} });
    act(() => {
      (el.querySelector('button') as HTMLButtonElement).click();
    });
    expect(ended).toBe(true);
  });

  test('Copier ⇒ onCopy', () => {
    let copied = false;
    const el = mount({ onEnd: () => {}, onCopy: () => (copied = true) });
    const buttons = el.querySelectorAll('button');
    act(() => {
      (buttons[buttons.length - 1] as HTMLButtonElement).click();
    });
    expect(copied).toBe(true);
  });

  /**
   * « SÉLECTIONNER » MET LE FOCUS SUR LA BARRE (revue #5814, défaut majeur
   * 8) — avant ce correctif, `document.activeElement` valait BODY après
   * l'action « Sélectionner » du menu du message : cette barre REMPLACE le
   * composeur exactement à ce moment (`thread.tsx`), et rien n'y prenait le
   * focus que `focusTakenRef` (`use-message-menu.ts`) promettait pris.
   */
  test('au montage, « Annuler » REÇOIT le focus', () => {
    const el = mount({ onEnd: () => {}, onCopy: () => {} });
    const cancelButton = el.querySelector('button')!;
    expect(document.activeElement).toBe(cancelButton);
  });
});
