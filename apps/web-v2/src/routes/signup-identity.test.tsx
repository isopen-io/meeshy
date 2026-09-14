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
   * Il n'est PAS derrière un (i) : ce n'est pas un détail qu'on consulte, c'est
   * une CONDITION du compte. Un témoin sur sa présence VISIBLE, pas sur son
   * existence dans le DOM.
   */
  test('il est rendu, en clair, sous le champ', () => {
    expect(html).toContain('data-signup-email-verification');
    expect(html).toContain('valider votre compte');
  });

  test('et il n’est pas replié — aucune classe sr-only ne le masque', () => {
    const bloc = html.slice(html.indexOf('data-signup-email-verification'));
    expect(bloc.slice(0, 120)).not.toContain('sr-only');
  });
});

describe('DerivedIdentity — ce que la passerelle recevra, affiché', () => {
  function rendu(username: string, displayName: string, suggestions: readonly string[] = []) {
    return renderToStaticMarkup(
      <DerivedIdentity
        username={username}
        displayName={displayName}
        onUsernameChange={() => {}}
        onDisplayNameChange={() => {}}
        tint="var(--ios-indigo-500)"
        focusedField={null}
        onFocus={() => {}}
        onBlur={() => {}}
        suggestions={suggestions}
      />,
    );
  }

  test('le pseudo et le nom affiché sont RENDUS', () => {
    const html = rendu('jean-dupont', 'Jean Dupont');
    expect(html).toContain('@jean-dupont');
    expect(html).toContain('Jean Dupont');
  });

  /**
   * Le repli est le PSEUDO, jamais du blanc : une adresse dont rien n'est
   * slugifiable ne donne aucun nom affiché, et laisser vide ferait croire que
   * rien ne sera créé.
   */
  test('sans nom affiché, le pseudo tient la ligne du haut', () => {
    const html = rendu('jean-dupont', '');
    expect(html).toContain('jean-dupont');
    expect(html).not.toContain('>' + '</span>');
  });

  /**
   * La contrepartie d'ENVOYER le pseudo : une collision est un refus. Les trois
   * valeurs libres doivent atteindre un pixel, sinon le refus est un mur.
   */
  test('les pseudos de rechange sont proposés, et cliquables', () => {
    const html = rendu('jean-dupont', 'Jean Dupont', ['jean-d', 'jean-dupont2']);
    expect(html).toContain('data-username-suggestions');
    expect(html).toContain('@jean-d');
    expect(html).toContain('@jean-dupont2');
  });

  test('replié, les saisies sortent du parcours clavier', () => {
    const html = rendu('jean-dupont', 'Jean Dupont');
    expect(html).toContain('tabindex="-1"');
  });

  /**
   * Un refus qui vise le pseudo OUVRE le bloc : laisser replié montrerait un
   * message d'erreur sous un champ que rien ne permet d'atteindre.
   */
  test('un refus rend la saisie atteignable', () => {
    const html = renderToStaticMarkup(
      <DerivedIdentity
        username="jean-dupont"
        displayName="Jean Dupont"
        onUsernameChange={() => {}}
        onDisplayNameChange={() => {}}
        tint="var(--ios-indigo-500)"
        focusedField={null}
        onFocus={() => {}}
        onBlur={() => {}}
        usernameError="Ce pseudo est déjà pris."
        suggestions={[]}
      />,
    );
    expect(html).toContain('Ce pseudo est déjà pris.');
    expect(html).not.toContain('tabindex="-1"');
  });
});
