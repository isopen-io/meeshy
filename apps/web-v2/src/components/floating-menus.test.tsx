import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from 'bun:test';

import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';
import { ADMIN_PERMISSIONS_QUERY_KEY, type AdminIdentity } from '@/lib/api/admin';
import { NOTIFICATIONS_QUERY_KEY } from '@/lib/api/notifications';
import { FRIENDS_QUERY_PREFIX } from '@/lib/api/friend-requests';
import { appQueryClient } from '@/lib/api/query-client';
import { sessionStore } from '@/lib/api/session';
import { FloatingMenus } from './floating-menus';
import { loadInterfaceCatalog, translate } from '@/lib/i18n-catalog';
import { MENU_LADDER } from '@/lib/view/floating-menu';

/**
 * LES DEUX MENUS FLOTTANTS (#6104) — ce que la capture ne prouve pas.
 *
 * Une capture montre six disques colorés ; elle ne dit ni où ils MÈNENT, ni si
 * le clavier les atteint, ni ce que le bouton ANNONCE quand son action change.
 * C'est cette moitié-là que ce fichier garde.
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

let container: HTMLDivElement;
let root: Root;

/* Les comptes de notifications (#6288) ET de demandes d'amitié (#6321) vivent
   dans le client PARTAGÉ : résolus pendant un témoin, ils changeraient le NOM
   du bouton ou du barreau « Découvrir » dans le suivant. Ces témoins-ci
   parlent du menu, pas des comptes (`floating-menus-unread.test.tsx`) — d'où
   le nettoyage AVANT ET APRÈS, pour ne dépendre ni d'un fichier qui aurait
   déjà peuplé le client avant celui-ci, ni d'un mount qui le peuplerait pour
   le suivant. */
beforeEach(() => {
  appQueryClient.removeQueries({ queryKey: NOTIFICATIONS_QUERY_KEY });
  appQueryClient.removeQueries({ queryKey: FRIENDS_QUERY_PREFIX });
});

afterEach(() => {
  act(() => {
    root.unmount();
  });
  container.remove();
  appQueryClient.removeQueries({ queryKey: NOTIFICATIONS_QUERY_KEY });
  appQueryClient.removeQueries({ queryKey: FRIENDS_QUERY_PREFIX });
});

function monter(routeKey = 'list'): HTMLDivElement {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root.render(<FloatingMenus routeKey={routeKey} />);
  });
  return container;
}

const boutonMenu = () => container.querySelector('[data-floating-menu]') as HTMLButtonElement;
const barreaux = () => [...container.querySelectorAll('[role="menuitem"]')] as HTMLAnchorElement[];

/**
 * LES MENUS DANS LA LANGUE D'INTERFACE (#6206) — écrit en ALLEMAND : en
 * français, les libellés d'hier et ceux du catalogue se confondent, et le
 * témoin ne pourrait pas tomber.
 */
describe('dans une autre langue d’interface', () => {
  test('de : les deux boutons, le menu et les six barreaux se disent en allemand', async () => {
    await loadInterfaceCatalog('de');
    document.documentElement.lang = 'de';
    try {
      monter();
      expect(container.querySelector('[data-floating-feed]')?.getAttribute('aria-label')).toBe('Feed');
      expect(boutonMenu().getAttribute('aria-label')).toBe('Menü');

      act(() => {
        boutonMenu().click();
      });

      expect(container.querySelector('[role="menu"]')?.getAttribute('aria-label')).toBe('Meeshy-Navigation');
      expect(barreaux().map((a) => a.getAttribute('aria-label'))).toEqual([
        'Meine Links',
        'Mitteilungen',
        'Anrufe',
        'Entdecken',
        'Communitys',
        'Einstellungen',
      ]);
      expect(boutonMenu().getAttribute('aria-label')).toBe('Profil');
    } finally {
      document.documentElement.lang = 'fr';
    }
  });
});

describe('au repos', () => {
  /**
   * L'échelle n'est pas seulement invisible : elle n'est pas MONTÉE. Six liens
   * cachés resteraient dans le parcours de tabulation — on tabulerait à travers
   * un menu fermé, ce qu'aucune capture ne montre jamais.
   */
  test('l’échelle n’est pas dans le document', () => {
    monter();
    expect(barreaux()).toHaveLength(0);
    expect(container.querySelector('[role="menu"]')).toBeNull();
  });

  test('les deux boutons sont là, et le menu s’annonce fermé', () => {
    monter();
    expect(container.querySelector('[data-floating-feed]')).not.toBeNull();
    expect(boutonMenu().getAttribute('aria-expanded')).toBe('false');
    expect(boutonMenu().getAttribute('aria-haspopup')).toBe('menu');
  });

  /**
   * **Le bouton de gauche est un LIEN** — il navigue, et rien d'autre. Un
   * `<button>` qui appellerait `navigate()` perdrait l'ouverture en nouvel
   * onglet, le survol qui montre l'adresse et le menu contextuel du
   * navigateur (`chrome-action.tsx:36`).
   */
  test('le Flux est un lien vers son adresse, jamais un bouton', () => {
    monter();
    const flux = container.querySelector('[data-floating-feed]');
    expect(flux?.tagName).toBe('A');
    expect(flux?.getAttribute('href')).toBe('/feed');
  });
});

/**
 * **LE DISQUE DU FLUX : UNE BASCULE ET UN APPUI LONG** (#6456) — miroir de
 * `onLeftTap: showFeed.toggle()` et `onLeftLongPress: presentFresh()`
 * (`RootView.swift:1557-1600`).
 *
 * La NAVIGATION se lit sur `history.pushState`, le site unique de `navigate` :
 * le document de témoin est `about:blank`, où l'adresse ne change pas, mais
 * l'appel, lui, dit où le geste mène. Le parcours dans un vrai navigateur —
 * tap, appui long, glisser, rechargement — est `check-feed-disc.mjs`.
 */
describe('le disque du Flux (#6456)', () => {
  const disque = () => container.querySelector('[data-floating-feed]') as HTMLAnchorElement;
  let originel: History['pushState'] = () => undefined;
  let empilees: string[] = [];

  beforeEach(() => {
    empilees = [];
    originel = window.history.pushState.bind(window.history);
    window.history.pushState = (data: unknown, unused: string, url?: string | URL | null) => {
      empilees = [...empilees, String(url)];
      originel(data, unused, url);
    };
  });

  afterEach(() => {
    /* Un appui long resté sans relâché (le menu contextuel) garde son avaleur
       armé : un appui neuf le désarme, comme chez l'utilisateur. */
    window.dispatchEvent(new PointerEvent('pointerdown', { button: 0, pointerId: 99 }));
    window.history.pushState = originel;
    try {
      localStorage.removeItem('feedButtonPosition');
    } catch {
      /* stockage indisponible : rien à nettoyer */
    }
  });

  const attendre = (ms: number) =>
    act(async () => {
      await new Promise((resolve) => setTimeout(resolve, ms));
    });

  const pointeur = (type: string, x: number, y: number) =>
    act(() => {
      disque().dispatchEvent(
        new PointerEvent(type, { bubbles: true, cancelable: true, button: 0, pointerId: 7, clientX: x, clientY: y }),
      );
    });

  const cliquer = () => {
    const clic = new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 });
    act(() => {
      disque().dispatchEvent(clic);
    });
    return clic;
  };

  const indice = () => {
    const id = disque().getAttribute('aria-describedby');
    return id === null ? null : (document.getElementById(id)?.textContent ?? null);
  };

  test('hors du Flux : un lien vers /feed, nommé « Flux », qui annonce son appui long', () => {
    monter('list');
    expect(disque().getAttribute('href')).toBe('/feed');
    expect(disque().getAttribute('aria-label')).toBe('Flux');
    expect(disque().getAttribute('data-disc-face')).toBe('feed');
    expect(indice()).toBe(translate('fr', 'a11y.floating.feed.hint'));
    expect(disque().getAttribute('aria-keyshortcuts')).toBe('Shift+F10');
  });

  /**
   * **L'INDICE DÉCRIT LE DISQUE, IL NE SE LIT PAS À PART** (#6499) — un texte
   * `sr-only` reste un nœud de l'arbre d'accessibilité : au balayage, VoiceOver
   * et TalkBack le lisaient AUSSI seul, détaché de tout contrôle (mesuré dans
   * l'arbre de Chromium). `hidden` le retire du parcours ; `aria-describedby`,
   * qui le référence directement, continue d'en lire le texte.
   */
  test('l’indice de l’appui long est la description du disque, jamais un texte lu seul', () => {
    for (const route of ['list', 'feed']) {
      monter(route);
      const id = disque().getAttribute('aria-describedby');
      const cible = id === null ? null : document.getElementById(id);
      expect(cible?.textContent).toBe(translate('fr', 'a11y.floating.feed.hint'));
      expect(cible?.hidden).toBe(true);
      act(() => {
        root.unmount();
      });
      container.remove();
    }
    monter('list');
  });

  /**
   * Sur le Flux, le NOM et le GLYPHE changent avec l'action — un disque qui
   * dirait « Flux » en ramenant aux conversations annoncerait une chose et en
   * ferait une autre.
   */
  test('sur le Flux : un lien vers la liste, nommé « Conversations », à la marque Meeshy', () => {
    monter('feed');
    expect(disque().getAttribute('href')).toBe('/');
    expect(disque().getAttribute('aria-label')).toBe('Conversations');
    expect(disque().getAttribute('data-disc-face')).toBe('conversations');
    expect(disque().querySelectorAll('svg line')).toHaveLength(3);
    expect(indice()).toBe(translate('fr', 'a11y.floating.feed.hint'));
  });

  test('un tap tremblé de 2 px ouvre le Flux', async () => {
    monter('list');
    pointeur('pointerdown', 100, 200);
    pointeur('pointermove', 102, 200);
    pointeur('pointerup', 102, 200);
    const clic = cliquer();
    expect(clic.defaultPrevented).toBe(true);
    expect(empilees).toEqual(['/feed']);
  });

  /**
   * **L'APPUI LONG OUVRE LES RÉELS, ET LE RELÂCHÉ N'OUVRE RIEN.** Sans
   * l'avalement du clic, l'utilisateur partirait vers les Réels puis serait
   * ramené au Flux par le clic que le navigateur émet au relâché.
   */
  test('un appui long de 500 ms ouvre les Réels, et le clic du relâché n’ouvre pas le Flux', async () => {
    monter('list');
    pointeur('pointerdown', 100, 200);
    await attendre(560);
    expect(empilees).toEqual(['/reels']);
    pointeur('pointerup', 100, 200);
    cliquer();
    expect(empilees).toEqual(['/reels']);
  });

  /**
   * **LE CLIC DU RELÂCHÉ RETOMBE SUR L'ÉCRAN SUIVANT** — le disque est démonté
   * par la navigation, et le clic que le navigateur synthétise au relâché
   * atteint ce qui est dessous (la scène des Réels, dont le tap met en pause).
   * Il est avalé ; le clic d'un NOUVEL appui, lui, passe.
   */
  test('le clic du relâché est avalé où qu’il retombe, et le geste suivant n’est pas mangé', async () => {
    monter('list');
    pointeur('pointerdown', 100, 200);
    await attendre(560);

    const dessous = document.createElement('button');
    document.body.appendChild(dessous);
    try {
      act(() => {
        dessous.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, cancelable: true, button: 0, pointerId: 7 }));
      });
      const fantome = new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 });
      act(() => {
        dessous.dispatchEvent(fantome);
      });
      expect(fantome.defaultPrevented).toBe(true);

      act(() => {
        dessous.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, button: 0, pointerId: 8 }));
        dessous.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, cancelable: true, button: 0, pointerId: 8 }));
      });
      const voulu = new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 });
      act(() => {
        dessous.dispatchEvent(voulu);
      });
      expect(voulu.defaultPrevented).toBe(false);
    } finally {
      dessous.remove();
    }
  });

  test('sur le Flux aussi, l’appui long ouvre les Réels et pas la liste', async () => {
    monter('feed');
    pointeur('pointerdown', 100, 200);
    await attendre(560);
    pointeur('pointerup', 100, 200);
    cliquer();
    expect(empilees).toEqual(['/reels']);
  });

  /** Relâché avant le seuil, c'est un tap : aucune porte vers les Réels ne s'ouvre en retard. */
  test('relâché avant 500 ms, c’est un tap — les Réels ne s’ouvrent pas après coup', async () => {
    monter('list');
    pointeur('pointerdown', 100, 200);
    await attendre(200);
    pointeur('pointerup', 100, 200);
    cliquer();
    await attendre(420);
    expect(empilees).toEqual(['/feed']);
  });

  /**
   * **Au-delà de 6 px, c'est un GLISSER** : ni les Réels (l'appui long est
   * annulé), ni le Flux (le clic est avalé) — même tenu plus de 500 ms.
   */
  test('un déplacement de 7 px annule l’appui long et devient un glisser qui n’ouvre rien', async () => {
    monter('list');
    pointeur('pointerdown', 100, 200);
    pointeur('pointermove', 107, 200);
    await attendre(560);
    pointeur('pointerup', 160, 260);
    cliquer();
    expect(empilees).toEqual([]);
  });

  /**
   * **LE CLAVIER A SON APPUI LONG** : `Maj+F10` et la touche de menu, les deux
   * déclencheurs de `long-press.ts` pour le menu d'un message — même geste,
   * même effet (dimension 6). Sans eux, l'indice annoncerait au clavier un
   * geste qu'il ne peut pas faire.
   */
  test('Maj+F10 et la touche de menu ouvrent les Réels', () => {
    monter('list');
    const touche = (init: KeyboardEventInit) => {
      const evenement = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init });
      act(() => {
        disque().dispatchEvent(evenement);
      });
      return evenement;
    };
    expect(touche({ key: 'F10', shiftKey: true }).defaultPrevented).toBe(true);
    expect(touche({ key: 'ContextMenu' }).defaultPrevented).toBe(true);
    expect(touche({ key: 'F10' }).defaultPrevented).toBe(false);
    expect(empilees).toEqual(['/reels', '/reels']);
  });

  /**
   * **LE MENU CONTEXTUEL DU SYSTÈME PENDANT L'APPUI** — un lien tenu au doigt
   * ouvre, sur Android, la bulle « ouvrir dans un onglet ». Pendant un appui,
   * il est avalé et vaut l'appui long ; au clic droit de la souris (aucun
   * appui principal en cours), le menu du navigateur reste.
   */
  test('le menu contextuel survenu pendant l’appui est avalé et ouvre les Réels ; le clic droit garde le sien', () => {
    monter('list');
    const menu = () => {
      const evenement = new MouseEvent('contextmenu', { bubbles: true, cancelable: true, button: 2 });
      act(() => {
        disque().dispatchEvent(evenement);
      });
      return evenement;
    };

    expect(menu().defaultPrevented).toBe(false);
    expect(empilees).toEqual([]);

    pointeur('pointerdown', 100, 200);
    expect(menu().defaultPrevented).toBe(true);
    expect(empilees).toEqual(['/reels']);
  });
});

describe('l’échelle ouverte', () => {
  /**
   * **LE TÉMOIN DE LA LOI 4** — les six barreaux MÈNENT quelque part, et là où
   * la table le dit. Un barreau sans `href` serait un disque coloré qui ne fait
   * rien, ce que ni l'œil ni une capture ne distinguent d'un barreau qui marche.
   */
  test('rend les six barreaux, dans l’ordre, chacun vers son adresse', () => {
    monter();
    act(() => {
      boutonMenu().click();
    });

    const rendus = barreaux();
    expect(rendus).toHaveLength(MENU_LADDER.length);
    expect(rendus.map((a) => a.getAttribute('aria-label'))).toEqual(MENU_LADDER.map((d) => translate('fr', d.labelKey)));
    for (const lien of rendus) {
      expect(lien.tagName).toBe('A');
      expect(lien.getAttribute('href')).toMatch(/^\/[a-z]+$/);
    }
  });

  /**
   * **Un bouton dont l'ACTION change doit changer de NOM.** iOS ouvre le profil
   * au second tap sur l'avatar (`RootView.swift:1570-1579`) : c'est la seule
   * porte du profil, qui n'a volontairement pas de barreau. Si le libellé
   * restait « Menu », le contrôle annoncerait une chose et en ferait une autre
   * — la définition même d'un contrôle qui ment.
   */
  test('le bouton s’annonce comme la porte du profil une fois ouvert', () => {
    monter();
    expect(boutonMenu().getAttribute('aria-label')).toBe('Menu');

    act(() => {
      boutonMenu().click();
    });

    expect(boutonMenu().getAttribute('aria-expanded')).toBe('true');
    expect(boutonMenu().getAttribute('aria-label')).toBe('Profil');
  });

  /**
   * Échap referme — la mécanique vient de `useRovingMenu`, mais ce témoin
   * prouve qu'elle est BRANCHÉE. Un hook correct non câblé rend un menu qu'on
   * ne peut plus fermer au clavier.
   */
  test('Échap la referme', () => {
    monter();
    act(() => {
      boutonMenu().click();
    });
    expect(barreaux()).toHaveLength(MENU_LADDER.length);

    act(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });

    expect(barreaux()).toHaveLength(0);
  });

  /**
   * La couche de fermeture PREND le geste sans rien assombrir — `Color.clear`
   * chez iOS (`RootView.swift:400-408`). Sans elle, un tap à côté laisserait le
   * menu ouvert par-dessus l'écran qu'on voulait atteindre.
   */
  test('un geste hors de l’échelle la referme', () => {
    monter();
    act(() => {
      boutonMenu().click();
    });

    const couche = container.querySelector('[data-floating-dismiss]') as HTMLElement;
    expect(couche).not.toBeNull();

    act(() => {
      couche.click();
    });

    expect(barreaux()).toHaveLength(0);
  });
});

/**
 * **LE BARREAU « ADMINISTRATION »** (#6458) — le septième, pour qui en a la
 * permission SERVIE. La garde elle-même est prouvée état par état dans
 * `use-admin-access.test.tsx` ; ce qui se prouve ici est son BRANCHEMENT : la
 * même entrée de cache que l'écran `/admin` décide du barreau, qui naît à la
 * fin de l'échelle, s'annonce, se parcourt au clavier et referme l'échelle.
 */
describe('le barreau « Administration » (#6458)', () => {
  const identite = (canAccessAdmin: boolean): AdminIdentity => ({
    role: canAccessAdmin ? 'ADMIN' : 'USER',
    permissions: {
      canAccessAdmin,
      canManageUsers: false,
      canManageGroups: false,
      canManageConversations: false,
      canViewAnalytics: false,
      canModerateContent: false,
      canViewAuditLogs: false,
      canManageNotifications: false,
      canManageTranslations: false,
    },
  });

  /* La session d'abord : le client partagé VIDE son cache à chaque changement
     d'identité (`query-client.ts`), la matrice se pose donc après elle. */
  function ouvrirEnTantQue(matrice: boolean | null): void {
    act(() => {
      sessionStore.getState().establish({
        user: { id: 'u-admin', username: 'admin', displayName: 'Admin' },
        token: 'jeton-de-test',
        sessionToken: 'session-de-test',
        expiresIn: 3600,
      });
    });
    if (matrice !== null) appQueryClient.setQueryData(ADMIN_PERMISSIONS_QUERY_KEY, identite(matrice));
    monter();
    act(() => {
      boutonMenu().click();
    });
  }

  const barreauAdmin = () => container.querySelector('[role="menuitem"][href="/admin"]') as HTMLAnchorElement | null;

  afterEach(() => {
    act(() => {
      sessionStore.getState().clearSession();
    });
    appQueryClient.removeQueries({ queryKey: ADMIN_PERMISSIONS_QUERY_KEY });
  });

  test('matrice servie avec le droit : sept barreaux, le dernier mène à /admin et se nomme « Administration »', () => {
    ouvrirEnTantQue(true);

    const rendus = barreaux();
    expect(rendus).toHaveLength(MENU_LADDER.length + 1);
    expect(rendus.at(-1)?.getAttribute('href')).toBe('/admin');
    expect(rendus.at(-1)?.getAttribute('aria-label')).toBe('Administration');
    expect(rendus.at(-1)?.querySelector('svg')).not.toBeNull();
  });

  test('matrice servie sans le droit : les six d’iOS, aucun chemin vers /admin', () => {
    ouvrirEnTantQue(false);

    expect(barreaux()).toHaveLength(MENU_LADDER.length);
    expect(barreauAdmin()).toBeNull();
  });

  test('matrice inconnue : les six d’iOS', () => {
    ouvrirEnTantQue(null);

    expect(barreaux()).toHaveLength(MENU_LADDER.length);
    expect(barreauAdmin()).toBeNull();
  });

  /**
   * Le septième barreau est dans le PARCOURS du menu, pas seulement dans le
   * DOM : `Fin` y pose le focus, `Bas` en repart vers le premier. Un
   * `itemCount` resté à six le laisserait hors d'atteinte du clavier.
   */
  test('le clavier l’atteint : Fin y pose le focus, Bas revient au premier, Haut y retourne', () => {
    ouvrirEnTantQue(true);
    const menu = container.querySelector('[role="menu"]') as HTMLElement;
    const touche = (key: string) =>
      act(() => {
        menu.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
      });

    touche('End');
    expect(document.activeElement).toBe(barreauAdmin());
    expect(barreauAdmin()?.getAttribute('tabindex')).toBe('0');

    touche('ArrowDown');
    expect(document.activeElement).toBe(barreaux()[0] ?? null);

    touche('ArrowUp');
    expect(document.activeElement).toBe(barreauAdmin());
  });

  /* La navigation elle-même se mesure au navigateur (`check-admin-rung.mjs`) :
     le document de témoin est `about:blank`, où `pushState` ne change pas
     d'adresse. Ici se prouve la fermeture, que le clic doit produire. */
  test('le choisir referme l’échelle', () => {
    ouvrirEnTantQue(true);
    act(() => {
      barreauAdmin()?.click();
    });

    expect(barreaux()).toHaveLength(0);
    expect(boutonMenu().getAttribute('aria-expanded')).toBe('false');
  });
});
