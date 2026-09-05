/**
 * LA SORTIE, CÔTÉ NAVIGATEUR (#5095) — `lib/realtime/deconnexion.ts`,
 * l'amélioration progressive du formulaire de l'espace membre.
 *
 * La soumission NATIVE reste le chemin qui marche partout : ce module n'ajoute
 * qu'un geste AVANT qu'elle parte — remplir le champ de session, vider la
 * session legacy, effacer toutes les places invitées, prévenir le travailleur
 * de zone — et chaque étape est BEST-EFFORT.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';

import { armeLaDeconnexion } from '@/lib/realtime/deconnexion';
import { CLES } from '@/lib/api/session-legacy';
import { cleDuLien, poseSession, type CleDeLien } from '@/lib/api/guest-session';
import { SIGNAL_DE_DECONNEXION } from '@/lib/sw/signal';

const monteLeFormulaire = (): HTMLFormElement => {
  document.body.innerHTML =
    '<form class="sortie" method="post" action="/deconnexion">' +
    '<input type="hidden" name="session" value="" />' +
    '<button type="submit">Se déconnecter</button>' +
    '</form>';
  return document.querySelector('form[action="/deconnexion"]') as HTMLFormElement;
};

const soumets = (formulaire: HTMLFormElement): void => {
  formulaire.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
};

const LIEN_A = 'mshy_AAA' as CleDeLien;

describe('armeLaDeconnexion', () => {
  beforeEach(() => {
    // Le marqueur d'idempotence vit sur le DOCUMENT et n'est PAS remis à zéro :
    // l'écouteur est délégué, il survit à chaque `it` — c'est précisément le
    // comportement qu'on veut, et chaque `armeLaDeconnexion()` qui suit le
    // premier est un no-op. L'idempotence a son propre témoin, sur un document
    // NEUF, seul terrain où elle est observable.
    localStorage.clear();
    document.cookie.split(';').forEach((morceau) => {
      const nom = morceau.split('=')[0]?.trim();
      if (nom) document.cookie = `${nom}=; Max-Age=0; Path=/`;
    });
  });

  it('sans formulaire sous la racine, ne fait rien et ne plante pas', () => {
    document.body.innerHTML = '<p>rien ici</p>';
    expect(() => armeLaDeconnexion()).not.toThrow();
  });

  it('remplit le champ session depuis localStorage à la soumission', () => {
    localStorage.setItem(CLES.jetonDeSession, 'sess-abc');
    const formulaire = monteLeFormulaire();
    armeLaDeconnexion();

    soumets(formulaire);

    const champ = formulaire.elements.namedItem('session') as HTMLInputElement;
    expect(champ.value).toBe('sess-abc');
  });

  it('retire les trois clés legacy de localStorage à la soumission', () => {
    localStorage.setItem(CLES.jeton, 'J');
    localStorage.setItem(CLES.jetonDeSession, 'S');
    localStorage.setItem(CLES.utilisateur, '{"id":"u1"}');
    const formulaire = monteLeFormulaire();
    armeLaDeconnexion();

    soumets(formulaire);

    expect(localStorage.getItem(CLES.jeton)).toBeNull();
    expect(localStorage.getItem(CLES.jetonDeSession)).toBeNull();
    expect(localStorage.getItem(CLES.utilisateur)).toBeNull();
  });

  it('efface toutes les places invitées à la soumission', () => {
    poseSession(LIEN_A, { jeton: 't', participantId: 'p1', pseudo: '' });
    const formulaire = monteLeFormulaire();
    armeLaDeconnexion();

    soumets(formulaire);

    expect(localStorage.getItem(cleDuLien(LIEN_A))).toBeNull();
  });

  it('poste le signal à chaque registration de service worker ACTIVE', () => {
    const postes: unknown[] = [];
    const registrations = [
      { active: { postMessage: (m: unknown) => postes.push(m) } },
      { active: null },
    ];
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: { getRegistrations: () => Promise.resolve(registrations) },
    });

    const formulaire = monteLeFormulaire();
    armeLaDeconnexion();
    soumets(formulaire);

    return Promise.resolve().then(() => {
      expect(postes).toEqual([{ type: SIGNAL_DE_DECONNEXION }]);
    });
  });

  it('poste le signal au CONTRÔLEUR sans attendre une micro-tâche — la page part déjà', () => {
    const postes: unknown[] = [];
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: {
        controller: { postMessage: (m: unknown) => postes.push(m) },
        getRegistrations: () => new Promise(() => undefined),
      },
    });

    const formulaire = monteLeFormulaire();
    armeLaDeconnexion();
    soumets(formulaire);

    // AUCUN `await` : le signal doit être parti à la seconde où la soumission
    // native démarre — `getRegistrations()` ci-dessus ne se résout JAMAIS.
    expect(postes).toEqual([{ type: SIGNAL_DE_DECONNEXION }]);
  });

  it('ne preventDefault JAMAIS — la soumission native reste le chemin qui marche', () => {
    const formulaire = monteLeFormulaire();
    armeLaDeconnexion();

    const evenement = new Event('submit', { bubbles: true, cancelable: true });
    formulaire.dispatchEvent(evenement);

    expect(evenement.defaultPrevented).toBe(false);
  });

  it('un formulaire monté APRÈS l’armement est pris quand même — l’écouteur est délégué', () => {
    localStorage.setItem(CLES.jetonDeSession, 'sess-tardive');
    document.body.innerHTML = '<p>pas encore de formulaire</p>';
    armeLaDeconnexion();

    const formulaire = monteLeFormulaire();
    soumets(formulaire);

    const champ = formulaire.elements.namedItem('session') as HTMLInputElement;
    expect(champ.value).toBe('sess-tardive');
  });

  it('un formulaire QUI N’EST PAS la sortie n’est jamais touché', () => {
    localStorage.setItem(CLES.jeton, 'J');
    document.body.innerHTML =
      '<form method="post" action="/chats"><input type="hidden" name="session" value="" /></form>';
    armeLaDeconnexion();

    const autre = document.querySelector('form') as HTMLFormElement;
    soumets(autre);

    expect(localStorage.getItem(CLES.jeton)).toBe('J');
  });

  it('armée DEUX fois sur le même document — un seul écouteur, une seule purge', () => {
    const postes: unknown[] = [];
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: {
        getRegistrations: () =>
          Promise.resolve([{ active: { postMessage: (m: unknown) => postes.push(m) } }]),
      },
    });

    // UN DOCUMENT NEUF : `document` porte déjà l'écouteur des `it` précédents,
    // et un écouteur anonyme ne se retire pas — l'idempotence ne s'observe que
    // sur un terrain vierge. C'est aussi la situation RÉELLE de `/chats`, où
    // `liste.ts` et `navigateur.ts` arment tous deux le même document.
    const neuf = document.implementation.createHTMLDocument('sortie');
    neuf.body.innerHTML =
      '<form class="sortie" method="post" action="/deconnexion">' +
      '<input type="hidden" name="session" value="" />' +
      '</form>';
    armeLaDeconnexion(neuf);
    armeLaDeconnexion(neuf);

    const formulaire = neuf.querySelector('form') as HTMLFormElement;
    formulaire.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));

    return Promise.resolve().then(() => {
      expect(postes).toEqual([{ type: SIGNAL_DE_DECONNEXION }]);
    });
  });

  it('une exception à une étape n’empêche pas les suivantes', () => {
    const original = Object.getOwnPropertyDescriptor(window, 'localStorage');
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      get() {
        throw new Error('bloqué');
      },
    });

    const formulaire = monteLeFormulaire();
    armeLaDeconnexion();

    expect(() => soumets(formulaire)).not.toThrow();

    if (original) Object.defineProperty(window, 'localStorage', original);
  });
});

/**
 * TOUT HÔTE DU FORMULAIRE SERT LE MODULE QUI L'ARME (#5095).
 *
 * `feuilleDeLEspace` — donc le `<form action="/deconnexion">` — est composée
 * par PLUSIEURS documents. Elle l'était déjà par deux quand la sortie a été
 * livrée armée depuis un seul (`liste.ts`, le module de `/chats`) : sur le
 * TABLEAU DE BORD, qui n'expédie aucun module de participation
 * (`app/connecte/vue.ts:99`), « Se déconnecter » expirait bien les cookies mais
 * ne vidait NI la session legacy, NI les places invitées, NI les caches de
 * zone — le critère 3 n'était jamais atteint par ce chemin.
 *
 * Ce témoin n'énumère donc PAS les hôtes à la main : il les DÉCOUVRE dans
 * `app/`, et exige de chacun le bloc du navigateur de zone — le seul module que
 * TOUS servent, et celui qui arme. Un troisième hôte qui apparaîtrait sans lui
 * rougit ici, au lieu de livrer une sortie muette de plus.
 */
describe('tout hôte du formulaire de sortie sert le module qui l’arme', () => {
  const RACINE_DE_L_APP = join(__dirname, '..', 'app');

  const fichiers = (dossier: string): readonly string[] =>
    readdirSync(dossier, { withFileTypes: true }).flatMap((entree) => {
      const chemin = join(dossier, entree.name);
      if (entree.isDirectory()) return fichiers(chemin);
      return entree.isFile() && chemin.endsWith('.ts') ? [chemin] : [];
    });

  const hotes = fichiers(RACINE_DE_L_APP).filter(
    (chemin) =>
      !chemin.endsWith(join('connecte', 'espace-vue.ts')) &&
      /feuilleDeLEspace\(\{/.test(readFileSync(chemin, 'utf8')),
  );

  it('les hôtes se trouvent — au moins le tableau de bord et la liste', () => {
    expect(hotes.length).toBeGreaterThanOrEqual(2);
    expect(hotes.some((c) => c.endsWith(join('connecte', 'vue.ts')))).toBe(true);
    expect(hotes.some((c) => c.endsWith(join('connecte', 'liste-vue.ts')))).toBe(true);
  });

  it.each(hotes.map((chemin) => [relative(join(__dirname, '..'), chemin), chemin]))(
    '%s sert blocDuNavigateur(), donc le module qui arme la sortie',
    (_nom, chemin) => {
      expect(readFileSync(chemin as string, 'utf8')).toContain('blocDuNavigateur()');
    },
  );

  it('et ce module arme bien la sortie', () => {
    const navigateur = readFileSync(
      join(__dirname, '..', 'lib', 'realtime', 'navigateur.ts'),
      'utf8',
    );
    expect(navigateur).toContain('armeLaDeconnexion()');
    // La liste l'arme AUSSI : sans `V3_NAVIGABLE`, `blocDuNavigateur()` ne
    // sert rien, et `/chats` garde sa purge par son propre module.
    expect(readFileSync(join(__dirname, '..', 'lib', 'realtime', 'liste.ts'), 'utf8')).toContain(
      'armeLaDeconnexion()',
    );
  });
});
