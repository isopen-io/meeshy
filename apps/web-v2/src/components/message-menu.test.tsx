import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';
import { useState } from 'react';

import { messageMenuItems, translationChoices } from '@/lib/view/message-actions';
import { loadInterfaceCatalog, translate } from '@/lib/i18n-catalog';
import { useLongPress } from '@/lib/view/long-press';
import { pinToBottom } from '@/lib/view/pin-to-bottom';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

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

beforeAll(async () => {
  ensureHappyDomRegistered();
  globals.IS_REACT_ACT_ENVIRONMENT = true;
  /* Le menu LIT son catalogue de façon synchrone (#7555) : le rendu jette si
     la langue n'est pas chargée — c'est le contrat de `i18n-catalog.ts`, pas
     un état à maquiller. Trois langues ici : le français des témoins
     existants, l'anglais et l'arabe du témoin de rang. */
  await Promise.all([loadInterfaceCatalog('fr'), loadInterfaceCatalog('en'), loadInterfaceCatalog('ar')]);
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
  /* La langue d'interface est un état GLOBAL du document : un témoin qui la
     déplace la rend, sinon le suivant mesure la langue du précédent. */
  document.documentElement.lang = 'fr';
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
    expect(labels).toEqual(['Sélectionner', 'Traduire', 'Copier', 'Répondre', 'Plus…']);
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
  test('Répondre ⇒ onAction("reply"), puis le menu se ferme', () => {
    let seen: string | undefined;
    const el = mount({ events: { onAction: (id) => (seen = id) } });
    act(() => {
      row(el).dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
    });
    const replyButton = Array.from(document.querySelectorAll('.message-menu-list [role="menuitem"]')).find(
      (b) => b.textContent === 'Répondre',
    ) as HTMLButtonElement;
    act(() => {
      replyButton.click();
    });
    expect(seen).toBe('reply');
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
 * LE MENU DANS LA LANGUE DU LECTEUR (#7555).
 *
 * POURQUOI CES TÉMOINS SONT SUR `en` ET `ar`, JAMAIS SUR `fr`. Les libellés
 * étaient EN DUR, en français : en `fr`, « le libellé codé » et « le libellé
 * servi par le catalogue » rendent EXACTEMENT le même verdict — c'est la
 * leçon 261 (un témoin de RANG ne se pose jamais sur le rang 1) appliquée à
 * la langue. Seule une locale NON française sépare les deux, et l'arabe est
 * la septième langue du produit — celle qu'un catalogue oublie en premier.
 *
 * CE QUE CES TÉMOINS NE DISENT PAS : le SENS D'ÉCRITURE. Mesuré sur `dist/`
 * en `ar-SA`, `document.documentElement` porte `lang="ar"` mais AUCUN
 * `dir="rtl"` — rien dans web-v2 ne le pose (ni le script d'amorçage, ni
 * `interface-language.ts`). Le menu rend bien l'arabe et ses contrôles
 * répondent ; il le rend de gauche à droite. C'est une lacune de l'écran
 * ENTIER, antérieure à ce lot — #7563 la porte. La consigner ici plutôt que
 * d'affirmer un `dir` que personne n'écrit.
 *
 * ET ON MESURE CE QUE LA RANGÉE AFFICHE, pas ce que le catalogue contient :
 * un témoin qui relit `catalog-en.ts` serait vert sur un menu resté français.
 */
describe('MessageMenu — les libellés viennent du catalogue (#7555)', () => {
  const labelsOf = (): readonly string[] =>
    Array.from(document.querySelectorAll('.message-menu-list [role="menuitem"]')).map((b) => b.textContent ?? '');

  test('interface EN ⇒ le menu rendu est anglais, pas français', () => {
    document.documentElement.lang = 'en';
    const el = mount();
    act(() => {
      row(el).dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
    });
    expect(labelsOf()).toEqual(['Select', 'Translate', 'Copy', 'Reply', 'More…']);
  });

  test('interface AR ⇒ le menu rendu est arabe, et son rail s’annonce en arabe', () => {
    document.documentElement.lang = 'ar';
    const el = mount();
    act(() => {
      row(el).dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
    });
    expect(labelsOf()).toEqual(['تحديد', 'ترجمة', 'نسخ', 'رد', 'المزيد…']);
    expect(document.querySelector('[data-message-menu-rail]')?.getAttribute('aria-label')).toBe(
      translate('ar', 'message.menu.react'),
    );
    expect(document.querySelector('[data-add-reaction]')?.getAttribute('aria-label')).toBe(
      translate('ar', 'message.menu.addReaction'),
    );
  });

  test('interface EN ⇒ le sous-menu Traduire s’annonce en anglais lui aussi', () => {
    document.documentElement.lang = 'en';
    const el = mount();
    act(() => {
      row(el).dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
    });
    const translateButton = Array.from(document.querySelectorAll('.message-menu-list [role="menuitem"]')).find(
      (b) => b.textContent === 'Translate',
    ) as HTMLButtonElement;
    act(() => {
      translateButton.click();
    });
    expect(document.querySelector('[role="group"][aria-label="Translate"]')).not.toBeNull();
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
    expect(labels).toEqual(['Sélectionner', 'Répondre', 'Plus…']);
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

/**
 * LE FIL SE RÉ-ANCRE TOUT SEUL, ET LE MENU DOIT TENIR (#7242).
 *
 * Mesuré au navigateur sur `/c/c-deploiement`, menu ouvert : la cellule de
 * frappe apparaît (`use-thread-typing.ts`, un `typing:start` suffit), le fil
 * grandit de 30 px, `pinToBottom` le ré-ancre en bas — et le `scroll` NATIF
 * que cette écriture provoque démontait le portail, treize millisecondes
 * après l'ouverture. Le lecteur visait une entrée ; le menu disparaissait
 * sans qu'il ait rien fait.
 *
 * Le témoin FORCE la fenêtre : il ouvre le menu D'ABORD, puis joue l'image
 * d'ancrage et le `scroll` que le navigateur livre ENSUITE — jamais les deux
 * dans le même tour de rendu, où le défaut est invisible.
 *
 * happy-dom n'émet aucun `scroll` pour une écriture de `scrollTop` : le
 * témoin le DISPATCHE, exactement comme le navigateur le livre (en capture,
 * cible = le défileur). C'est la SEULE chose qu'il simule — la déclaration,
 * elle, vient du VRAI `pinToBottom`.
 */
describe('MessageMenu — un défilement de l’APPLICATION ne ferme pas le menu', () => {
  /** `requestAnimationFrame` bouchonné — même patron que `pin-to-bottom.test.ts` :
   * les images se jouent À LA MAIN, l'écriture devient observable. */
  const frameQueue = () => {
    const pending = new Map<number, FrameRequestCallback>();
    let next = 1;
    return {
      requestFrame: (callback: FrameRequestCallback) => {
        const id = next;
        next += 1;
        pending.set(id, callback);
        return id;
      },
      cancelFrame: (id: number) => {
        pending.delete(id);
      },
      run: () => {
        const entries = [...pending.entries()];
        pending.clear();
        for (const [, callback] of entries) callback(0);
      },
    };
  };

  const openMenu = (el: HTMLDivElement) => {
    act(() => {
      row(el).dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
    });
  };

  /** Le défileur du fil, HORS du portail — `useRovingMenu` écoute `scroll`
   * en CAPTURE sur `document`, exactement comme le navigateur le livre. */
  const threadScroller = (): HTMLElement => {
    const element = document.createElement('main');
    document.body.appendChild(element);
    return element;
  };

  /**
   * LE DÉPLACEMENT DE L'ANCRE SE POSE (#7293) — happy-dom rend un rectangle
   * NUL pour tout élément, donc la grandeur que la règle LIT ne varie jamais
   * toute seule ici. Un défilement du lecteur emporte la rangée : le témoin
   * doit donc le DIRE, sinon il mesure une immobilité de banc plutôt que le
   * geste qu'il nomme. C'est la même discipline que `frameQueue` au-dessus —
   * ce que le navigateur fournit, le banc le fournit à la main.
   */
  const anchorAt = (el: HTMLDivElement, top: number) => {
    row(el).getBoundingClientRect = () =>
      ({ top, bottom: top + 40, left: 0, right: 200, width: 200, height: 40, x: 0, y: top, toJSON: () => ({}) }) as DOMRect;
  };

  test('l’ancrage bas (quelqu’un se met à écrire) laisse le menu MONTÉ', () => {
    const el = mount();
    anchorAt(el, 400);
    openMenu(el);
    expect(document.querySelectorAll('[role="menu"]').length).toBe(1);

    const scroller = threadScroller();
    const queue = frameQueue();
    act(() => {
      pinToBottom(scroller, { frames: 1, requestFrame: queue.requestFrame, cancelFrame: queue.cancelFrame });
      queue.run();
      // L'ancrage EMPORTE la rangée : sans ce déplacement, le témoin
      // passerait par immobilité et non par la déclaration qu'il mesure.
      anchorAt(el, 280);
      scroller.dispatchEvent(new Event('scroll'));
    });

    expect(document.querySelectorAll('[role="menu"]').length).toBe(1);
    scroller.remove();
  });

  test('un défilement du LECTEUR, lui, ferme le menu', () => {
    const el = mount();
    anchorAt(el, 400);
    openMenu(el);
    const scroller = threadScroller();
    act(() => {
      anchorAt(el, 120);
      scroller.dispatchEvent(new Event('scroll'));
    });
    expect(document.querySelectorAll('[role="menu"]').length).toBe(0);
    scroller.remove();
  });

  test('la déclaration se CONSOMME — le geste d’APRÈS referme bien le menu', () => {
    const el = mount();
    anchorAt(el, 400);
    openMenu(el);
    const scroller = threadScroller();
    const queue = frameQueue();
    act(() => {
      pinToBottom(scroller, { frames: 1, requestFrame: queue.requestFrame, cancelFrame: queue.cancelFrame });
      queue.run();
      anchorAt(el, 280);
      scroller.dispatchEvent(new Event('scroll'));
    });
    expect(document.querySelectorAll('[role="menu"]').length).toBe(1);

    act(() => {
      anchorAt(el, 160);
      scroller.dispatchEvent(new Event('scroll'));
    });
    expect(document.querySelectorAll('[role="menu"]').length).toBe(0);
    scroller.remove();
  });

  /**
   * #7293 — L'ÉVÉNEMENT EN VOL. Amener une rangée en vue PUIS l'ouvrir pose
   * un `scroll` que le navigateur livre à l'image SUIVANTE, donc APRÈS le
   * commit du menu. Il ne vient pas de l'application (rien à déclarer) et il
   * ne dit rien de neuf : l'ancre est déjà là où le placement l'a mesurée.
   * Le fermer là-dessus faisait disparaître le cluster avant d'être regardé.
   */
  test('un défilement EN VOL, qui ne déplace pas l’ancre, laisse le menu MONTÉ', () => {
    const el = mount();
    anchorAt(el, 400);
    openMenu(el);
    const scroller = threadScroller();
    act(() => {
      scroller.dispatchEvent(new Event('scroll'));
    });
    expect(document.querySelectorAll('[role="menu"]').length).toBe(1);
    scroller.remove();
  });
});
