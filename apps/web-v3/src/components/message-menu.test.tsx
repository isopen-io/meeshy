import { GlobalRegistrator } from '@happy-dom/global-registrator';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';
import { useState } from 'react';

import { messageMenuItems, translationChoices } from '@/lib/view/message-actions';
import { useLongPress } from '@/lib/view/long-press';

import { MessageMenu, type MessageMenuTarget } from './message-menu';

/**
 * TÉMOIN DE COMPOSANT (#5814, T8-T11) — patron `composer.test.tsx:60-110`
 * (happy-dom + `createRoot` + `act`). `Harness` reproduit le câblage exact
 * que `routes/thread.tsx` posera sur `[data-row]` (`useLongPress` + montage
 * conditionnel de `MessageMenu`) au-dessus d'une rangée MINIMALE — la même
 * anatomie qu'une `FocalRow`/une `Bubble` du point de vue de ce geste : un
 * conteneur `data-row` focalisable qui porte le TEXTE du message.
 */
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

type HarnessEvents = {
  onReact?: (emoji: string) => void;
  onExpandReactions?: () => void;
  onAction?: (id: string) => void;
  onPickLanguage?: (code: string) => void;
};

function Harness({
  text = 'Les épinglées passent devant, puis le temporel.',
  isMine = false,
  protectedMessage = false,
  flatRow = false,
  events = {},
}: {
  readonly text?: string;
  readonly isMine?: boolean;
  readonly protectedMessage?: boolean;
  /** Simule une rangée FOCAL/SCRIPT (`data-reading-mode`, `focal-row.tsx`)
   * plutôt qu'une bulle — motif §11 de la revue #5814. */
  readonly flatRow?: boolean;
  readonly events?: HarnessEvents;
}) {
  const [target, setTarget] = useState<MessageMenuTarget | null>(null);
  const longPress = useLongPress({
    onOpen: (anchor) => setTarget({ messageId: 'm2', element: anchor.element, isMine }),
  });

  const items = messageMenuItems({ hasText: true, isProtected: protectedMessage, languageCount: 2 });
  const choices = translationChoices({
    message: { originalLanguage: 'fr', translations: [{ id: 't', messageId: 'm2', targetLanguage: 'en', translatedContent: 'Hello', translationModel: 'medium', createdAt: new Date() }] },
    preferredLanguages: ['en'],
    servedLanguage: 'en',
  });

  return (
    <div>
      <div
        data-row="m2"
        data-message="m2"
        id="row-m2"
        tabIndex={0}
        {...longPress}
      >
        {flatRow ? (
          <div data-reading-mode="focal">
            <p>{text}</p>
          </div>
        ) : (
          <p>{text}</p>
        )}
      </div>
      {target !== null ? (
        <MessageMenu
          target={target}
          items={items}
          choices={choices}
          subjectLabel={`Actions du message de Amina Diallo : ${text}`}
          onClose={() => setTarget(null)}
          onReact={(emoji) => events.onReact?.(emoji)}
          onExpandReactions={() => events.onExpandReactions?.()}
          onAction={(id) => events.onAction?.(id)}
          onPickLanguage={(code) => events.onPickLanguage?.(code)}
        />
      ) : null}
    </div>
  );
}

function mount(props: Parameters<typeof Harness>[0] = {}): HTMLDivElement {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root.render(<Harness {...props} />);
  });
  return container;
}

const row = (el: HTMLDivElement): HTMLDivElement => el.querySelector('[data-row="m2"]')!;

describe('MessageMenu — ouvrir (T8)', () => {
  test('contextmenu sur la rangée ⇒ exactement UN [role="menu"]', () => {
    const el = mount();
    act(() => {
      row(el).dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
    });
    expect(document.querySelectorAll('[role="menu"]').length).toBe(1);
  });

  test('pointerdown 500 ms sans bouger ⇒ ouvert', async () => {
    const el = mount();
    await act(async () => {
      row(el).dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX: 10, clientY: 10, button: 0 }));
      await new Promise((r) => setTimeout(r, 520));
    });
    expect(document.querySelectorAll('[role="menu"]').length).toBe(1);
  });

  test('pointerdown puis déplacement de 8 px avant 500 ms ⇒ jamais ouvert', async () => {
    const el = mount();
    await act(async () => {
      row(el).dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX: 10, clientY: 10, button: 0 }));
      row(el).dispatchEvent(new PointerEvent('pointermove', { bubbles: true, clientX: 18, clientY: 10 }));
      await new Promise((r) => setTimeout(r, 520));
    });
    expect(document.querySelectorAll('[role="menu"]').length).toBe(0);
  });

  test('ContextMenu et Shift+F10 sur la rangée focalisée ⇒ ouvert', () => {
    const el = mount();
    act(() => {
      row(el).dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'ContextMenu' }));
    });
    expect(document.querySelectorAll('[role="menu"]').length).toBe(1);
  });

  test('le rail porte 6 menuitem emoji + « Ajouter une réaction »', () => {
    const el = mount();
    act(() => {
      row(el).dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
    });
    const rail = document.querySelector('[role="group"][aria-label="Réagir"]')!;
    const tiles = rail.querySelectorAll('[role="menuitem"]');
    expect(tiles.length).toBe(7);
    expect(document.querySelector('[aria-label="Ajouter une réaction"]')).not.toBeNull();
  });

  test('les entrées, dans l’ordre : Sélectionner · Traduire · Copier · Composer · Plus…', () => {
    const el = mount();
    act(() => {
      row(el).dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
    });
    const list = document.querySelector('.message-menu-list')!;
    const labels = Array.from(list.querySelectorAll('[role="menuitem"]')).map((b) => b.textContent);
    expect(labels).toEqual(['Sélectionner', 'Traduire', 'Copier', 'Composer', 'Plus…']);
  });

  test('l’aperçu contient le texte de la rangée et AUCUN data-message/data-row dupliqué', () => {
    const el = mount({ text: 'Un texte bien à moi' });
    act(() => {
      row(el).dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
    });
    const preview = document.querySelector('[data-message-preview]')!;
    expect(preview.textContent).toContain('Un texte bien à moi');
    expect(preview.hasAttribute('data-message')).toBe(false);
    expect(preview.hasAttribute('data-row')).toBe(false);
    expect(preview.querySelectorAll('[data-message], [data-row], [id]').length).toBe(0);
    // Une SEULE ancre `data-message="m2"` dans tout le document : la rangée
    // vivante, jamais le clone.
    expect(document.querySelectorAll('[data-message="m2"]').length).toBe(1);
  });
});

describe('MessageMenu — fermer (T9)', () => {
  test('Échap ⇒ menu démonté ET le focus revient à la rangée', () => {
    const el = mount();
    act(() => {
      row(el).dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
    });
    act(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Escape' }));
    });
    expect(document.querySelectorAll('[role="menu"]').length).toBe(0);
    expect(document.activeElement).toBe(row(el));
  });

  test('pointerdown HORS du cluster ⇒ fermé', () => {
    const el = mount();
    act(() => {
      row(el).dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
    });
    act(() => {
      document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    });
    expect(document.querySelectorAll('[role="menu"]').length).toBe(0);
  });

  test('le focus ENTRE dans le menu à l’ouverture', async () => {
    const el = mount();
    await act(async () => {
      row(el).dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
      await new Promise((r) => setTimeout(r, 50));
    });
    const cluster = document.querySelector('[role="menu"]')!;
    expect(cluster.contains(document.activeElement)).toBe(true);
  });

  /**
   * LE RETOUR MATÉRIEL FERME LE MENU, PAS L'ÉCRAN (revue #5814, défaut
   * majeur 6) — `popstate` est ce que le back button Capacitor déclenche
   * sur la WebView (`@capacitor/app`, miroir `Sheet`). Mesuré sur
   * `Meeshy_Poc_Web-v31` (`AND-9-back-depuis-menu.png`) : sans ce câblage,
   * le menu ne réagissait à AUCUN `popstate` et le retour matériel quittait
   * directement l'écran hôte, menu toujours ouvert.
   */
  test('popstate (retour matériel) ⇒ menu démonté SANS naviguer davantage', () => {
    const el = mount();
    act(() => {
      row(el).dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
    });
    expect(document.querySelectorAll('[role="menu"]').length).toBe(1);
    act(() => {
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
    expect(document.querySelectorAll('[role="menu"]').length).toBe(0);
  });

  test('ouverture ⇒ pose UNE entrée d’historique que le retour consomme', () => {
    const el = mount();
    const before = window.history.length;
    act(() => {
      row(el).dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
    });
    expect(window.history.length).toBe(before + 1);
  });
});

describe('MessageMenu — effets (T10)', () => {
  test('Composer ⇒ onAction("compose"), puis le menu se ferme', () => {
    let seen: string | undefined;
    const el = mount({ events: { onAction: (id) => (seen = id) } });
    act(() => {
      row(el).dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
    });
    const composeButton = Array.from(document.querySelectorAll('.message-menu-list [role="menuitem"]')).find(
      (b) => b.textContent === 'Composer',
    ) as HTMLButtonElement;
    act(() => {
      composeButton.click();
    });
    expect(seen).toBe('compose');
    expect(document.querySelectorAll('[role="menu"]').length).toBe(0);
  });

  test('un tap sur 👍 ⇒ onReact("m2","👍"), le menu se ferme', () => {
    const seen: string[] = [];
    const el = mount({ events: { onReact: (emoji) => seen.push(emoji) } });
    act(() => {
      row(el).dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
    });
    const thumbsUp = document.querySelector('[aria-label="👍"]') as HTMLButtonElement;
    act(() => {
      thumbsUp.click();
    });
    expect(seen).toEqual(['👍']);
    expect(document.querySelectorAll('[role="menu"]').length).toBe(0);
  });

  test('Traduire ouvre le sous-menu ; choisir une langue ⇒ onPickLanguage, menu fermé', () => {
    const seen: string[] = [];
    const el = mount({ events: { onPickLanguage: (code) => seen.push(code) } });
    act(() => {
      row(el).dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
    });
    const translateButton = Array.from(document.querySelectorAll('.message-menu-list [role="menuitem"]')).find(
      (b) => b.textContent === 'Traduire',
    ) as HTMLButtonElement;
    act(() => {
      translateButton.click();
    });
    // UN SEUL `role="menu"` dans le document — le panneau de langues est un
    // GROUPE de `menuitemradio` (revue #5814 : un `menu` dans un `menu` est
    // invalide en ARIA, et le critère de fin dit « UN menu `role=menu` »).
    const submenu = document.querySelector('[role="group"][aria-label="Traduire"]');
    expect(submenu).not.toBeNull();
    expect(document.querySelectorAll('[role="menu"]').length).toBe(1);
    const enChoice = submenu!.querySelector('[role="menuitemradio"][aria-checked="true"]') as HTMLButtonElement;
    expect(enChoice).not.toBeNull();
    act(() => {
      enChoice.click();
    });
    expect(seen).toEqual(['en']);
    expect(document.querySelectorAll('[role="menu"]').length).toBe(0);
  });

  test('Plus… ⇒ onAction("more"), Sélectionner ⇒ onAction("select")', () => {
    const seen: string[] = [];
    const el = mount({ events: { onAction: (id) => seen.push(id) } });
    act(() => {
      row(el).dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
    });
    const moreButton = Array.from(document.querySelectorAll('.message-menu-list [role="menuitem"]')).find(
      (b) => b.textContent === 'Plus…',
    ) as HTMLButtonElement;
    act(() => {
      moreButton.click();
    });
    expect(seen).toEqual(['more']);
  });
});

/**
 * LE PARCOURS CLAVIER (revue #5814) — le rail est HORIZONTAL, la liste
 * VERTICALE, et Tab ne doit jamais sortir du cluster : derrière le voile, les
 * rangées du fil sont focalisables (`tabIndex=0`) et pourtant invisibles.
 *
 * TÉMOIN DE RÉGRESSION : avant correction, `ArrowRight` sur le rail levait
 * `TypeError: event.preventDefault is not a function` — l'adaptateur
 * RECOPIAIT l'événement (`{ ...event, key }`) et perdait une méthode de
 * PROTOTYPE. Le rail était donc inerte au clavier, sans qu'aucun témoin ne
 * rougisse.
 */
describe('MessageMenu — le parcours clavier (revue #5814)', () => {
  const openMenu = (el: HTMLDivElement) => {
    act(() => {
      row(el).dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
    });
  };
  /** `at(0)!`/`at(1)!` sont refusés par `noUncheckedIndexedAccess` : on rend
   *  un tuple explicite plutôt que d'éparpiller des assertions. */
  const railTiles = (): HTMLElement[] =>
    Array.from(document.querySelectorAll<HTMLElement>('[role="group"][aria-label="Réagir"] [role="menuitem"]'));
  const tileAt = (index: number): HTMLElement => {
    const tile = railTiles()[index];
    if (tile === undefined) throw new Error(`aucune tuile de rail à l'index ${index}`);
    return tile;
  };

  test('ArrowRight sur le rail passe à la tuile suivante', () => {
    const el = mount();
    openMenu(el);
    const first = tileAt(0);
    act(() => {
      first.focus();
      first.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'ArrowRight' }));
    });
    expect(document.activeElement).toBe(tileAt(1));
  });

  test('ArrowLeft sur la première tuile revient sur la dernière (boucle)', () => {
    const el = mount();
    openMenu(el);
    const first = tileAt(0);
    act(() => {
      first.focus();
      first.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'ArrowLeft' }));
    });
    // Le parcours boucle sur TOUT le cluster (rail + liste) : depuis la
    // première tuile, « précédent » est la DERNIÈRE entrée de la liste.
    const last = Array.from(document.querySelectorAll('.message-menu-list [role="menuitem"]')).at(-1);
    expect(document.activeElement).toBe(last);
  });

  test('Tab ne sort pas du cluster', () => {
    const el = mount();
    openMenu(el);
    const cluster = document.querySelector('[role="menu"]')!;
    const first = tileAt(0);
    act(() => {
      first.focus();
      first.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Tab' }));
    });
    expect(cluster.contains(document.activeElement)).toBe(true);
    expect(document.activeElement).not.toBe(row(el));
  });

  test('Échap depuis le sous-menu Traduire rend la main à la liste, sans fermer', () => {
    const el = mount();
    openMenu(el);
    const translateButton = Array.from(document.querySelectorAll('.message-menu-list [role="menuitem"]')).find(
      (b) => b.textContent === 'Traduire',
    ) as HTMLButtonElement;
    act(() => {
      translateButton.click();
    });
    expect(document.querySelector('[role="group"][aria-label="Traduire"]')).not.toBeNull();
    act(() => {
      (document.querySelector('[role="menuitemradio"]') as HTMLElement).dispatchEvent(
        new KeyboardEvent('keydown', { bubbles: true, key: 'Escape' }),
      );
    });
    expect(document.querySelector('[role="group"][aria-label="Traduire"]')).toBeNull();
    expect(document.querySelectorAll('[role="menu"]').length).toBe(1);
  });
});

describe('MessageMenu — garde de protection (T11, D-23)', () => {
  test('un message protégé n’offre ni Copier ni Traduire', () => {
    const el = mount({ protectedMessage: true });
    act(() => {
      row(el).dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
    });
    const labels = Array.from(document.querySelectorAll('.message-menu-list [role="menuitem"]')).map((b) => b.textContent);
    expect(labels).toEqual(['Sélectionner', 'Composer', 'Plus…']);
  });
});

/**
 * L'APERÇU EST SOULEVÉ (revue #5814, défaut majeur 11) — l'élévation vit
 * sur l'HÔTE du clone (`filter: drop-shadow`), jamais sur le clone
 * lui-même, et une SURFACE opaque n'apparaît que sur la rangée PLATE, qui
 * n'a ni fond ni rayon propres — une bulle porte déjà les siens.
 */
describe('MessageMenu — l’aperçu est SOULEVÉ (revue #5814, défaut majeur 11)', () => {
  const previewHost = (): HTMLElement => document.querySelector('[data-message-menu-preview-host]')!;

  test('rangée plate (Focal) : halo + ombre (drop-shadow) ET une surface opaque', () => {
    const el = mount({ flatRow: true });
    act(() => {
      row(el).dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
    });
    const host = previewHost();
    expect(host.style.filter).toContain('drop-shadow');
    expect(host.style.backgroundColor).not.toBe('');
  });

  test('bulle : halo + ombre (drop-shadow), SANS surface ajoutée (elle porte déjà la sienne)', () => {
    const el = mount({ flatRow: false });
    act(() => {
      row(el).dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
    });
    const host = previewHost();
    expect(host.style.filter).toContain('drop-shadow');
    expect(host.style.backgroundColor).toBe('');
  });
});

/**
 * LE MENU NOMME SON SUJET, ET LE CLONE N'EST PLUS FOCALISABLE (revue #5814,
 * défaut majeur 13).
 */
describe('MessageMenu — le sujet est nommé, le clone est neutralisé (revue #5814, défaut majeur 13)', () => {
  test('aria-label du menu porte l’auteur ET un extrait, pas le générique « Actions du message »', () => {
    const el = mount({ text: 'Un texte suffisamment distinctif' });
    act(() => {
      row(el).dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
    });
    const menu = document.querySelector('[role="menu"]')!;
    expect(menu.getAttribute('aria-label')).not.toBe('Actions du message');
    expect(menu.getAttribute('aria-label')).toContain('Un texte suffisamment distinctif');
  });

  test('le clone porte `inert` — plus aucun élément focalisable dans l’aperçu', () => {
    const el = mount();
    act(() => {
      row(el).dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
    });
    const host = document.querySelector('[data-message-menu-preview-host]')!;
    expect(host.hasAttribute('inert')).toBe(true);
  });
});
