import { renderToStaticMarkup } from 'react-dom/server';
import { beforeAll, describe, expect, test } from 'bun:test';

import { loadInterfaceCatalog, translate } from '@/lib/i18n-catalog';
import { SUPPORTED_INTERFACE_LANGUAGES } from '@/lib/inline-interface-language-bootstrap.js';

import { LoginDoors } from './login';
import { WelcomeDoors } from './welcome';

/**
 * LES REPÈRES DES ÉCRANS D'ENTRÉE (épure #17584, règle 7) — la connexion se
 * NOMME et dit, sans ouvrir un (i), ce que « Recevoir le lien » déclenche ;
 * l'accueil parle la langue de l'interface, jamais un français en dur.
 */

beforeAll(async () => {
  await Promise.all(SUPPORTED_INTERFACE_LANGUAGES.map((language) => loadInterfaceCatalog(language)));
});

const withoutFolded = (html: string): string => html.replace(/<(p|span)[^>]*class="[^"]*sr-only[^"]*"[^>]*>.*?<\/\1>/gsu, '');

describe('/login — l’écran se nomme et dit ce que fait son bouton', () => {
  const html = renderToStaticMarkup(<LoginDoors method="lien" />);

  test('un titre de premier niveau : « Connexion »', () => {
    expect(html).toMatch(/<h1[^>]*>Connexion<\/h1>/u);
  });

  test('la phrase du lien e-mail se lit au repos, hors de toute note repliée', () => {
    expect(withoutFolded(html)).toContain('Nous vous envoyons un lien par e-mail : ouvrez-le, vous êtes connecté.');
  });

  test('le (i) ne porte plus que le détail : la durée de vie du lien', () => {
    expect(html).toContain('aria-label="Combien de temps le lien reste-t-il valable ?"');
    expect(html).toContain('Le lien est valable 10 minutes et ne sert qu’une fois.');
    expect(html).not.toContain('Pas de mot de passe à retenir');
  });

  test('la porte du mot de passe porte le même nom d’écran', () => {
    expect(renderToStaticMarkup(<LoginDoors method="password" />)).toContain('>Connexion</h');
  });
});

describe('/welcome — plus aucun texte en dur', () => {
  test('la phrase d’accueil est celle du lexique, dans la langue de l’interface', () => {
    expect(renderToStaticMarkup(<WelcomeDoors language="fr" />)).toContain('Chaque message, dans votre langue.');
    const english = renderToStaticMarkup(<WelcomeDoors language="en" />);
    expect(english).toContain('Every message, in your language.');
    expect(english).toContain('Create an account');
    expect(english).toContain('Sign in');
    expect(english).not.toContain('Créer un compte');
    expect(english).not.toContain('Ouvre');
  });

  test('les cinq textes existent dans les sept langues, traduits', () => {
    for (const key of ['welcome.tagline', 'welcome.createAccount', 'welcome.signIn', 'welcome.createAccount.hint', 'welcome.signIn.hint', 'login.title', 'magicLink.lead', 'magicLink.howItWorks', 'magicLink.howItWorks.text'] as const) {
      const values = SUPPORTED_INTERFACE_LANGUAGES.map((language) => translate(language, key));
      expect(values.every((value) => value.length > 3)).toBe(true);
      expect(new Set(values).size).toBe(SUPPORTED_INTERFACE_LANGUAGES.length);
    }
  });
});
