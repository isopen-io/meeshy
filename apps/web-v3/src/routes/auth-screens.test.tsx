import { describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

import { CountrySheet } from '@/components/country-sheet';
import { Field } from '@/components/field';
import { LanguageSheet } from '@/components/language-sheet';

import LoginScreen from './login';
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
  const html = renderToStaticMarkup(<LoginScreen />);

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
    expect(html).toContain('Identifiant, e-mail ou téléphone');
    expect(html).toContain('Mot de passe');
    expect(html).toContain('disabled');
  });

  test('« Créer un compte » est une ANCRE vers /signup — pas un bouton qui navigue', () => {
    expect(html).toContain('href="/signup"');
  });
});

/**
 * LES DEUX PORTES (#5816, T8) — `LoginView.swift:478-503` : « Connexion sans
 * mot de passe » AVANT « Mot de passe oublié ? » dans le HTML (l'ordre de
 * son doc-comment l.479-480), toutes deux des ANCRES.
 */
describe('LoginScreen — les deux portes', () => {
  const html = renderToStaticMarkup(<LoginScreen />);

  test('« Connexion sans mot de passe » (/auth/magic-link) précède « Mot de passe oublié ? » (/forgot-password)', () => {
    const magicLinkIndex = html.indexOf('href="/auth/magic-link"');
    const forgotPasswordIndex = html.indexOf('href="/forgot-password"');
    expect(magicLinkIndex).toBeGreaterThan(-1);
    expect(forgotPasswordIndex).toBeGreaterThan(-1);
    expect(magicLinkIndex).toBeLessThan(forgotPasswordIndex);
    expect(html).toContain('Connexion sans mot de passe');
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

  test('les TROIS chemins de retour vers la connexion sont des `<a href="/login">`', () => {
    // Le « X » (qui appelait `window.history.back()` — sans destination sur un
    // lien profond), « Déjà un compte ? Se connecter », et le « Se connecter »
    // qui apparaît sous l'e-mail déjà pris (absent de l'état initial : deux
    // ancres ici, la troisième est prouvée en recette).
    expect(html.match(/href="\/login"/g)).toHaveLength(2);
    expect(html).not.toContain('history.back');
  });

  test('la pastille de langue rend le nom NATIF, avec son `lang` — jamais le code en capitales', () => {
    // La locale de `bun test` n'est pas garantie : on mesure la FORME (un nœud
    // porteur de `lang`), pas une langue particulière — c'est elle qui manquait.
    expect(html).toContain('Vous lirez Meeshy en');
    expect(html).toMatch(/<span lang="[a-z]{2,3}">/);
  });

  test('les deux pages légales sont des ancres PLEIN DOCUMENT', () => {
    expect(html).toContain('href="/terms"');
    expect(html).toContain('href="/privacy"');
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
