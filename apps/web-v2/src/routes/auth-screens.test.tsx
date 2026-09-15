import { renderToStaticMarkup } from 'react-dom/server';
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';

import { CountrySheet } from '@/components/country-sheet';
import { Field } from '@/components/field';
import { LanguageSheet } from '@/components/language-sheet';
import { loadInterfaceCatalog } from '@/lib/i18n-catalog';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

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
