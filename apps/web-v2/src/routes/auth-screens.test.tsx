import { act, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import { CountrySheet } from '@/components/country-sheet';
import { Field } from '@/components/field';
import { LanguageSheet } from '@/components/language-sheet';
import { loadInterfaceCatalog } from '@/lib/i18n-catalog';
import { authColumnIn, strayFromAuthColumn } from '@/test-support/auth-column';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';
import { controlledBy, perceivableText } from '@/test-support/perceivable-text';

import ForgotPasswordScreen, { type ForgotPasswordDeps } from './forgot-password';
import { LoginDoors } from './login';
import SignupScreen from './signup';
import WelcomeScreen from './welcome';

/**
 * LES DEUX PORTES, RENDUES (revue de #5555) — ce que les témoins purs
 * (`signup-form`, `auth-feedback`, `session-guard`) ne pouvaient pas prouver :
 * qui AFFICHE ce qu'ils décident. Un résolveur juste dont la valeur n'atteint
 * aucun pixel n'a corrigé personne (§ Prisme, cycle 122) — la même question
 * vaut pour un refus, une navigation et une marque.
 *
 * `renderToStaticMarkup` (react-dom/server) et non un DOM : l'application
 * compile son JSX vers de VRAIS éléments React sous `bun test`, hors du
 * pipeline Vite qui les aliaserait vers Preact — même raison, et même
 * méthode, que `components/avatar.test.tsx`. Les `useEffect` ne s'exécutent
 * pas : c'est l'ÉTAT INITIAL qui est mesuré, celui que tout visiteur voit.
 */

describe('LoginScreen — la marque et la version', () => {
  // La porte du MOT DE PASSE (#6404) : c'est elle qui porte les deux champs
  // que ce bloc mesure. La porte par défaut (connexion par e-mail) a ses propres
  // témoins dans `login-doors.test.tsx`.
  const html = renderToStaticMarkup(<LoginDoors method="motdepasse" />);

  test('rend le GLYPHE des trois traits, jamais l’icône d’application', () => {
    expect(html.match(/<line/g)).toHaveLength(3);
    expect(html).not.toContain('/brand/logo.png');
  });

  test('la version du pied de marque vient de `__APP_VERSION__`, jamais d’un littéral', () => {
    // Le témoin ne compare pas à « 3.1.0 » : il compare au SYMBOLE que
    // `vite.config.ts` remplit depuis `package.json` (et `bunfig.toml` par une
    // sentinelle sous test). Écrire la version ici aurait recréé la copie que
    // la correction supprime.
    expect(html).toContain(`Meeshy ${__APP_VERSION__}`);
    expect(html).toContain('Services CEO');
  });

  test('les deux champs requis sont nommés, et le bouton part DÉSACTIVÉ (aucun champ rempli)', () => {
    // Le LIBELLÉ nomme désormais les trois formes que la passerelle accepte
    // (`AuthService.ts:155-158`) — le gabarit ne les disait qu'à qui regardait
    // le champ vide (#6404).
    expect(html).toContain('E-mail, téléphone ou pseudo');
    expect(html).toContain('Mot de passe');
    expect(html).toContain('disabled');
  });

  test('« Créer un compte » est une ANCRE vers /signup — pas un bouton qui navigue', () => {
    expect(html).toContain('href="/signup"');
  });
});

/**
 * LES DEUX PORTES (#5816, T8 — réordonnées par #6404) — `LoginView.swift:478-503`
 * empilait « Connexion sans mot de passe » AVANT « Mot de passe oublié ? ».
 * La directive porteur 2026-09-13 monte la première d'un cran de plus : elle
 * n'est plus un lien sous le formulaire, elle EST la porte par défaut. Sur la
 * porte du mot de passe, le retour vers elle garde sa place — au-dessus de
 * « Mot de passe oublié ? », comme iOS.
 */
describe('LoginScreen — les deux portes', () => {
  const html = renderToStaticMarkup(<LoginDoors method="motdepasse" />);

  test('le retour vers le lien (/login) précède « Mot de passe oublié ? » (/forgot-password)', () => {
    const lienIndex = html.indexOf('Se connecter par e-mail');
    const forgotPasswordIndex = html.indexOf('href="/forgot-password"');
    expect(lienIndex).toBeGreaterThan(-1);
    expect(forgotPasswordIndex).toBeGreaterThan(-1);
    expect(lienIndex).toBeLessThan(forgotPasswordIndex);
    expect(html).toContain('Mot de passe oublié ?');
  });

  test('les deux sont des ANCRES — aucun `onClick` qui navigue via history', () => {
    expect(html).not.toContain('history.pushState');
  });
});

/**
 * L'ACCUEIL (#5816, T8) — `WelcomeView.swift` : le glyphe des trois traits
 * (jamais l'icône d'application), « Meeshy », la tagline, les deux portes
 * (`/signup`, `/login`), le pied de marque.
 */
describe('WelcomeScreen', () => {
  const html = renderToStaticMarkup(<WelcomeScreen />);

  test('rend le GLYPHE des trois traits, jamais l’icône d’application', () => {
    expect(html.match(/<line/g)).toHaveLength(3);
    expect(html).not.toContain('/brand/logo.png');
  });

  test('« Meeshy » et sa tagline sont rendus', () => {
    expect(html).toContain('Meeshy');
    expect(html).toContain('Écrivez dans votre langue');
  });

  test('les deux portes sont des ANCRES vers /signup et /login', () => {
    expect(html).toContain('href="/signup"');
    expect(html).toContain('href="/login"');
    expect(html).toContain('Créer un compte');
    expect(html).toContain('Se connecter');
  });

  test('le pied de marque « Services CEO » est rendu', () => {
    expect(html).toContain('Services CEO');
  });
});

describe('SignupScreen — les navigations sont des ancres, la langue vient du catalogue PARTAGÉ', () => {
  const html = renderToStaticMarkup(<SignupScreen />);

  /**
   * L'ÉTAT INITIAL NE MONTRE PLUS QUE LE PREMIER BARREAU (#6405) — mais les
   * deux SORTIES restent : le « X » et « Déjà un compte ? ». Elles ne sont pas
   * des champs, et quelqu'un qui s'est trompé d'écran ne doit pas remplir une
   * adresse pour faire paraître le lien qui l'emmène ailleurs. La pastille de
   * langue et les deux pages légales, elles, vivent au troisième barreau —
   * `signup-rungs.test.tsx` les mesure une fois dépliés.
   */
  test('les deux sorties vers la connexion sont des ANCRES, dès la première seconde', () => {
    expect(html.match(/href="\/login"/g)).toHaveLength(2);
    expect(html).not.toContain('history.back');
  });
});

describe('Les feuilles sont de VRAIES modales — `<dialog>`, pas une annonce', () => {
  const noop = () => undefined;
  const country = renderToStaticMarkup(<CountrySheet onSelect={noop} onClose={noop} />);
  const language = renderToStaticMarkup(<LanguageSheet onSelect={noop} onClose={noop} />);

  test('l’élément est un `<dialog>` — jamais un `<div role="dialog" aria-modal>`', () => {
    // `aria-modal="true"` ANNONCE une modale sans en faire une : la tabulation
    // continuait derrière la feuille et Échap ne fermait rien (mesuré). Seul
    // `<dialog>` ouvert par `showModal()` rend les trois comportements.
    for (const html of [country, language]) {
      expect(html).toContain('<dialog');
      expect(html).not.toContain('aria-modal');
      expect(html).not.toContain('role="dialog"');
    }
  });

  test('chaque feuille est NOMMÉE par son titre rendu, pas par une chaîne à part', () => {
    for (const html of [country, language]) {
      const labelledBy = html.match(/aria-labelledby="([^"]+)"/);
      expect(labelledBy).not.toBeNull();
      expect(html).toContain(`id="${labelledBy?.[1]}"`);
    }
  });

  test('la feuille de langue rend le nom NATIF avec son `lang`, et son drapeau du catalogue partagé', () => {
    expect(language).toContain('<span class="flex-1 text-body" lang="de"');
    expect(language).toContain('Deutsch');
    expect(language).toContain('🇩🇪');
  });

  /**
   * `title`/`selected` (#5828, § 4.8) — RÉUTILISÉE par le composeur, jamais
   * une jumelle : sans `title`, l'inscription garde son libellé par défaut ;
   * avec, le composeur peut la nommer « Langue d'écriture ».
   */
  test('sans `title`, le `<h2>` porte toujours « Langue de lecture » (l’inscription est inchangée)', () => {
    expect(language).toContain('>Langue de lecture</h2>');
  });

  test('avec `title="Langue d’écriture"`, le `<h2>` le porte', () => {
    const withTitle = renderToStaticMarkup(<LanguageSheet onSelect={noop} onClose={noop} title="Langue d’écriture" />);
    expect(withTitle).toContain('>Langue d’écriture</h2>');
  });

  test('`selected="de"` marque la ligne allemande, et SEULEMENT elle', () => {
    const withSelection = renderToStaticMarkup(<LanguageSheet onSelect={noop} onClose={noop} selected="de" />);
    const rows = withSelection.split('<li>').slice(1); // le premier fragment est l'en-tête, avant toute ligne.
    const markedRows = rows.filter((row) => row.includes('aria-current="true"'));
    expect(markedRows).toHaveLength(1);
    expect(markedRows[0]).toContain('lang="de"');
    const frenchRow = rows.find((row) => row.includes('lang="fr"'));
    expect(frenchRow).not.toBeUndefined();
    expect(frenchRow).not.toContain('aria-current');
  });

  test('sans `selected`, aucune ligne ne porte `aria-current`', () => {
    expect(language).not.toContain('aria-current');
  });
});

/**
 * LA FEUILLE DE LANGUE PARLE LA LANGUE D'INTERFACE (#6328) — avant ce lot,
 * le titre par défaut et la recherche étaient deux littéraux français, quelle
 * que soit l'interface. `document.documentElement.lang` gouverne
 * `currentInterfaceLanguage()` (`lib/interface-language.ts`) : ce bloc le
 * pose explicitement, à la différence du bloc ci-dessus qui compte sur
 * `document` absent (⇒ repli français) pour ses propres assertions. L'état
 * vide (`languageSheet.empty`) est couvert par sa PARITÉ et sa traduction
 * exacte dans `i18n-catalog.test.ts` — cette feuille n'a aucun moyen
 * d'interaction pour filtrer sans saisie, hors de portée d'un rendu statique.
 */
describe('LanguageSheet — les textes système suivent l’interface, pas le français', () => {
  const noop = () => undefined;

  beforeAll(async () => {
    ensureHappyDomRegistered();
    await loadInterfaceCatalog('de');
    document.documentElement.lang = 'de';
  });

  afterAll(async () => {
    document.documentElement.lang = 'fr';
    await releaseHappyDomIfRegistered();
  });

  test('interface allemande ⇒ titre par défaut et recherche en allemand, jamais en français', () => {
    const html = renderToStaticMarkup(<LanguageSheet onSelect={noop} onClose={noop} />);
    expect(html).toContain('>Lesesprache</h2>');
    expect(html).toContain('aria-label="Sprache suchen"');
    expect(html).toContain('placeholder="Sprache suchen"');
    expect(html).not.toContain('Langue de lecture');
    expect(html).not.toContain('Rechercher une langue');
  });
});

describe('Field — le refus est DESSINÉ sous son champ, et le champ le DÉSIGNE', () => {
  const withError = renderToStaticMarkup(
    <Field id="essai" label="Adresse e-mail" tint="var(--ios-indigo-500)" focused={false} error="Cette adresse est déjà prise">
      {({ id, describedBy }) => <input id={id} aria-describedby={describedBy} aria-invalid={describedBy !== undefined} />}
    </Field>,
  );

  test('le texte est rendu, en `role="alert"`, et porte l’identifiant que le champ désigne', () => {
    expect(withError).toContain('role="alert"');
    expect(withError).toContain('Cette adresse est déjà prise');
    expect(withError).toContain('id="essai-error"');
    expect(withError).toContain('aria-describedby="essai-error"');
    expect(withError).toContain('aria-invalid="true"');
  });

  test('sans refus, AUCUN nœud d’alerte — et le champ ne se déclare pas invalide', () => {
    const clean = renderToStaticMarkup(
      <Field id="essai" label="Adresse e-mail" tint="var(--ios-indigo-500)" focused={false}>
        {({ id, describedBy }) => <input id={id} aria-describedby={describedBy} aria-invalid={describedBy !== undefined} />}
      </Field>,
    );
    expect(clean).not.toContain('role="alert"');
    expect(clean).toContain('aria-invalid="false"');
  });
});

/**
 * LES ÉCRANS MONTÉS DANS UN VRAI DOM (#6643) — la colonne et le mot de passe
 * oublié ont besoin d'un clic, d'une saisie et d'une réponse, qu'un rendu
 * statique ne sait pas jouer.
 */
const actGlobals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
const unmounts: Array<() => void> = [];

function mount(node: ReactNode): HTMLDivElement {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(node);
  });
  unmounts.push(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
  });
  return container;
}

function withMountedDom() {
  beforeAll(() => {
    ensureHappyDomRegistered({ url: 'http://localhost/' });
    actGlobals.IS_REACT_ACT_ENVIRONMENT = true;
  });
  afterEach(() => {
    unmounts.splice(0).forEach((unmount) => unmount());
  });
  afterAll(async () => {
    delete actGlobals.IS_REACT_ACT_ENVIRONMENT;
    await releaseHappyDomIfRegistered();
  });
}

const flat = (el: Element) => (el.textContent ?? '').replace(/\s+/gu, ' ');

describe('Les pages d’accès tiennent dans UNE colonne, la puce « Fermer » comprise (#6643)', () => {
  withMountedDom();

  test('l’accueil : ses deux portes vivent dans la colonne', () => {
    const el = mount(<WelcomeScreen />);
    expect(authColumnIn(el)?.querySelector('a[href="/signup"]')).not.toBeNull();
    expect(strayFromAuthColumn(el)).toEqual([]);
  });

  test('l’inscription : la puce « Fermer » vit DANS la colonne, jamais au bord de l’écran', () => {
    const el = mount(<SignupScreen />);
    const column = authColumnIn(el);
    expect(column?.querySelector('a[aria-label="Fermer"]')?.getAttribute('href')).toBe('/login');
    expect(column?.querySelector('#signup-email')).not.toBeNull();
    expect(strayFromAuthColumn(el)).toEqual([]);
  });
});

/**
 * « MOT DE PASSE OUBLIÉ » SERT AUSSI À CRÉER UN MOT DE PASSE (#6643).
 *
 * Directive porteur 2026-09-15 : « la page de récupération de mot de passe doit
 * permettre de setter le mot de passe même si on a jamais eu de mot de passe ».
 * Le lien part aussi vers un compte qui n'en a jamais eu (#6642, passerelle) ;
 * l'écran le dit sans détail technique — une phrase qui parle de CHOISIR, et le
 * cas du premier mot de passe derrière un (i) qui NOMME la question (D-71).
 */
describe('Mot de passe oublié — le même lien sert à créer un premier mot de passe (#6643)', () => {
  withMountedDom();

  const EMAIL = 'ada@meeshy.example';

  function forgotStub() {
    const calls: string[] = [];
    const deps: ForgotPasswordDeps = {
      forgotPassword: async (email: string) => {
        calls.push(email);
        return { ok: true, data: { message: 'ok' }, status: 200 };
      },
    };
    return { calls, deps };
  }

  test('la phrase dit « par e-mail » et « choisir », le bouton « Recevoir le lien » — dans la colonne', () => {
    const el = mount(<ForgotPasswordScreen deps={forgotStub().deps} />);
    expect(el.querySelector('h1')?.textContent).toBe('Mot de passe oublié');
    expect(flat(el)).toContain('Recevez par e-mail un lien pour choisir un nouveau mot de passe.');
    expect(el.querySelector('button[type="submit"]')?.textContent).toBe('Recevoir le lien');
    expect(authColumnIn(el)?.querySelector('#forgot-email')).not.toBeNull();
    expect(strayFromAuthColumn(el)).toEqual([]);
  });

  test('« Jamais eu de mot de passe ? » est un (i) dont la question se LIT, replié, qui s’ouvre sur la réponse', () => {
    const el = mount(<ForgotPasswordScreen deps={forgotStub().deps} />);
    const info = el.querySelector('button[aria-label="Jamais eu de mot de passe ?"]') as HTMLButtonElement | null;
    expect(info?.textContent).toContain('Jamais eu de mot de passe ?');
    expect(info?.getAttribute('aria-expanded')).toBe('false');
    const note = controlledBy(info);
    expect(note?.textContent).toBe('Ce même lien vous permet d’en créer un.');
    expect(note?.classList.contains('sr-only')).toBe(true);

    act(() => {
      info?.click();
    });
    expect(info?.getAttribute('aria-expanded')).toBe('true');
    expect(note?.classList.contains('sr-only')).toBe(false);
  });

  test('aucun libellé perçu ne dit « réinitialisation » ni « magique »', () => {
    const el = mount(<ForgotPasswordScreen deps={forgotStub().deps} />);
    expect(perceivableText(el)).not.toMatch(/r[ée]initialis|magi(que|c)/iu);
  });

  test('envoyé : « E-mail envoyé », l’adresse, un (i) « Rien reçu ? » et le retour à la connexion — dans la colonne', async () => {
    const stub = forgotStub();
    const el = mount(<ForgotPasswordScreen deps={stub.deps} />);
    const input = el.querySelector('#forgot-email') as HTMLInputElement;
    act(() => {
      input.value = EMAIL;
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await act(async () => {
      el.querySelector('form')?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      await Promise.resolve();
    });

    expect(stub.calls).toEqual([EMAIL]);
    expect(el.querySelector('h2')?.textContent).toBe('E-mail envoyé');
    expect(flat(el)).toContain(`Ouvrez le lien reçu à ${EMAIL}`);
    expect(el.querySelector('button[aria-label="Rien reçu ?"]')).not.toBeNull();
    const retour = [...el.querySelectorAll('a')].find((a) => flat(a).trim() === 'Retour à la connexion');
    expect(retour?.getAttribute('href')).toBe('/login');
    expect(perceivableText(el)).not.toMatch(/r[ée]initialis|magi(que|c)/iu);
    expect(strayFromAuthColumn(el)).toEqual([]);
  });
});
