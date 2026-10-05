import { describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

import { DerivedIdentity } from '@/components/derived-identity';

import SignupScreen from './signup';

/**
 * L'ÉCRAN D'INSCRIPTION REFAIT (#6479) — ce que les témoins purs ne peuvent pas
 * prouver : l'ORDRE des champs, la présence de l'avertissement, et le fait que
 * l'identité dérivée atteigne bien un pixel.
 *
 * `renderToStaticMarkup` mesure l'ÉTAT INITIAL, celui que tout visiteur voit —
 * les `useEffect` ne s'exécutent pas, et c'est exactement ce qu'on veut ici.
 */

const html = renderToStaticMarkup(<SignupScreen />);

/**
 * LES PHASES VIVANTES (#8288, qui REDÉCOUPE les deux barreaux de #6582 —
 * directive porteur 2026-09-27 : « le téléphone d'abord »).
 *
 * `renderToStaticMarkup` mesure l'état INITIAL : c'est exactement ce qu'il faut
 * pour prouver ce qui ne paraît PAS encore. Les phases suivantes se mesurent
 * sur un formulaire qu'on remplit — `signup-phases.test.ts` prouve la loi,
 * `signup-phases.test.tsx` prouve qu'elle atteint des pixels.
 */
describe('à l’ouverture, le TÉLÉPHONE et lui seul', () => {
  test('le numéro est là, dans son verre', () => {
    expect(html).toMatch(/data-signup-phone-glass[^>]*>[\s\S]*id="signup-phone"/u);
  });

  test('ni l’adresse, ni l’identité, ni le mot de passe ne sont rendus — pas même repliés', () => {
    expect(html).not.toContain('id="signup-email"');
    expect(html).not.toContain('data-derived-identity');
    expect(html).not.toContain('signup-password');
  });

  test('« S’inscrire » est là, inactif : il n’y a rien à créer encore', () => {
    expect(html).toMatch(/<button[^>]*type="submit"[^>]*disabled=""[^>]*>S’inscrire<\/button>/u);
  });

  test('aucun libellé ne dit « magique »', () => expect(html).not.toMatch(/magi(que|c)/iu));
});
describe('DerivedIdentity — deux saisies remplies, aucun bouton « Modifier » (#7897)', () => {
  function rendu(options: { suggestions?: readonly string[]; usernameError?: string } = {}) {
    return renderToStaticMarkup(
      <DerivedIdentity
        username="jean-dupont"
        displayName="Jean Dupont"
        usernamePlaceholder="jean-dupont"
        displayNamePlaceholder="Jean Dupont"
        onUsernameChange={() => {}}
        onDisplayNameChange={() => {}}
        tint="var(--ios-indigo-500)"
        focusedField={null}
        onFocus={() => {}}
        onBlur={() => {}}
        usernameError={options.usernameError}
        suggestions={options.suggestions ?? []}
      />,
    );
  }

  test('le nom affiché et le pseudo sont des saisies REMPLIES', () => {
    const html = rendu();
    expect(html).toMatch(/<input id="signup-display-name"[^>]*value="Jean Dupont"/u);
    expect(html).toMatch(/<input id="signup-username"[^>]*value="jean-dupont"/u);
  });

  test('aucun bouton Modifier, aucune saisie hors du parcours clavier, ni prénom ni nom', () => {
    const html = rendu();
    expect(html).not.toContain('Modifier');
    expect(html).not.toContain('aria-expanded');
    expect(html).not.toContain('tabindex="-1"');
    expect(html).not.toContain('Prénom');
  });

  test('chaque saisie porte un libellé visible', () => {
    const html = rendu();
    expect(html).toContain('>Nom affiché</label>');
    expect(html).toContain('>Pseudo</label>');
  });

  test('les pseudos de rechange sont proposés, et cliquables', () => {
    const html = rendu({ suggestions: ['jean-d', 'jean-dupont2'] });
    expect(html).toContain('data-username-suggestions');
    expect(html).toContain('@jean-d');
    expect(html).toContain('@jean-dupont2');
  });

  test('un refus se pose sous le pseudo', () => {
    const html = rendu({ usernameError: 'Ce pseudo est déjà pris.' });
    expect(html).toContain('Ce pseudo est déjà pris.');
    expect(html).toMatch(/<input id="signup-username"[^>]*aria-invalid="true"/u);
  });
});
