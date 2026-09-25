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
 * LES DEUX BARREAUX (#6405, REDÉCOUPÉ par #6582 — directive porteur
 * 2026-09-14 : « il faut mettre dès le départ le numéro et l'e-mail à
 * montrer »).
 *
 * L'ordre reste celui de #6479 : l'ADRESSE ouvre le formulaire, parce que tout
 * en découle — l'identité dérivée n'a rien à montrer avant elle, et le lien de
 * validation part vers elle. Ce qui change, c'est que le NUMÉRO ne se mérite
 * plus : il paraît avec l'adresse, sur le même barreau de CONTACT.
 *
 * `renderToStaticMarkup` mesure l'état INITIAL : c'est exactement ce qu'il faut
 * pour prouver ce qui ne paraît PAS encore. L'ordre COMPLET, lui, se mesure sur
 * un formulaire qu'on remplit — `signup-rungs.test.ts` prouve la loi,
 * `signup-rungs.test.tsx` prouve qu'elle atteint des pixels.
 */
describe('à l’ouverture, le CONTACT et lui seul', () => {
  const positions = {
    email: html.indexOf('signup-email'),
    telephone: html.indexOf('signup-phone-hint'),
    identite: html.indexOf('data-derived-identity'),
    motDePasse: html.indexOf('signup-password'),
  };

  test('l’adresse est là, et le numéro AVEC elle', () => {
    expect(positions.email).toBeGreaterThan(-1);
    expect(positions.telephone).toBeGreaterThan(positions.email);
  });

  test('ni l’identité, ni le mot de passe ne sont rendus — pas même repliés', () => {
    expect(positions.identite).toBe(-1);
    expect(positions.motDePasse).toBe(-1);
  });

  test('le bouton « Créer mon compte » ne paraît pas non plus : il n’y a rien à créer', () =>
    expect(html).not.toContain('Créer mon compte'));
});

describe('l’avertissement de validation d’adresse', () => {
  /**
   * DERRIÈRE UN (i) « Pourquoi un lien » depuis #6626 (directive porteur
   * 2026-09-15 : « moins de détails sur la page de connexion et
   * d'enregistrement ; utiliser des (i) »). #6479 l'avait posé en clair ; la
   * directive postérieure le supplante. Replié ne veut pas dire absent : le
   * texte reste porté par `aria-describedby` du champ, donc un lecteur d'écran
   * l'entend en entrant dans l'adresse.
   */
  const note = /<p id="([^"]+)" class="([^"]*)"[^>]*>Nous vous enverrons un lien à cette adresse : il faudra l’ouvrir pour valider votre compte\.<\/p>/u.exec(html);

  test('le champ e-mail porte un (i) « Pourquoi un lien », replié', () => {
    const bouton = /<button[^>]*aria-expanded="false"[^>]*aria-controls="([^"]+)"[^>]*aria-label="Pourquoi un lien"/u.exec(html);
    expect(bouton).not.toBeNull();
    expect(note?.[1]).toBe(bouton?.[1]);
  });

  test('la note est rendue, mais repliée — `sr-only`, jamais en clair', () => {
    expect(note).not.toBeNull();
    expect(note?.[2]).toContain('sr-only');
  });

  test('et le champ la cite dans `aria-describedby`', () => {
    const champ = /<input id="signup-email"[^>]*aria-describedby="([^"]+)"/u.exec(html);
    expect(champ).not.toBeNull();
    expect(champ?.[1]).toBe(note?.[1]);
  });

  /** Citer une note n'est pas un refus : un champ qui déduirait `aria-invalid`
   * de la seule présence d'un `aria-describedby` s'annoncerait « invalide »
   * dès l'ouverture, sur une adresse que personne n'a encore tapée. */
  test('le champ vide ne s’annonce pas invalide pour autant', () => {
    expect(html).toMatch(/<input id="signup-email"[^>]*aria-invalid="false"/u);
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
