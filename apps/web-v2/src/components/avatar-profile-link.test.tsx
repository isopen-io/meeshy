import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

import { loadInterfaceCatalog } from '@/lib/i18n-catalog';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { Avatar } from './avatar';

/**
 * **L'AVATAR EST LA PORTE DU PROFIL** (#6396, directive porteur 2026-09-20).
 *
 * ## La mesure qui ouvre le lot
 *
 * Relevé sur les **30 surfaces** de web-v2 qui rendent un avatar : **aucune ne
 * mène au profil**. Le composant est pourtant unique — `components/avatar.tsx`,
 * importé par 28 fichiers, sans jumelle — et ne portait **aucun `onClick`,
 * aucun `href`** : la clicabilité appartenait à l'hôte, et aucun hôte ne
 * l'exerçait pour le profil. Là où un avatar ÉTAIT cliquable, il menait
 * ailleurs : le fil (`lens-row.tsx:271`), le repli d'un en-tête
 * (`thread-header.tsx:197`), une réponse (`face-ramp.tsx:44`).
 *
 * Le seul chemin vers `/u/$username` dans toute l'application était la
 * `@mention` (`components/rich-text.tsx:68`), hébergée par trois surfaces.
 *
 * ## LA CAPACITÉ EST DANS LE COMPOSANT, LA DÉCISION RESTE À L'HÔTE
 *
 * `Avatar` ne devient PAS cliquable partout : il le devient là où un hôte lui
 * passe un pseudo. C'est le même contrat que `onGesture` sur la carte du fil —
 * la mécanique est unique, l'activation est locale. Deux raisons, et elles sont
 * mesurées :
 *
 * 1. certains hôtes sont DÉJÀ des `<Link>` ou des `<button>`
 *    (`lens-row.tsx:271`, `communities-parts.tsx:428`) ; un lien imbriqué dans
 *    un lien est invalide, et le dépôt n'en porte aucun aujourd'hui ;
 * 2. l'avatar d'une COMMUNAUTÉ (`communities-parts.tsx:187`) n'est pas un
 *    utilisateur.
 *
 * ## LA CIBLE TACTILE, ET POURQUOI ELLE N'EST PAS LA TAILLE DE L'AVATAR
 *
 * Les avatars de liste descendent à 24–32 px. Les rendre cliquables tels quels
 * poserait des cibles sous le plancher de 44 px que ce dépôt tient partout
 * (dimension 5). La cible est donc ÉTENDUE par un pseudo-élément centré —
 * `max(100%, 44px)` — qui ne prend aucune place dans le flux : la mise en page
 * des 28 hôtes ne bouge pas d'un pixel, et la zone atteignable au doigt
 * respecte la règle.
 */

beforeAll(async () => {
  ensureHappyDomRegistered();
  await loadInterfaceCatalog('fr');
});

afterAll(async () => {
  await releaseHappyDomIfRegistered();
});

/* Les assertions portent sur la CHAÎNE rendue, jamais sur un DOM reconstruit :
   c'est le motif des témoins voisins (`prism-pastille-i18n.test.tsx`), et il
   évite d'injecter du balisage dans un document pour le relire. */

describe('sans pseudo, rien ne change — le contre-témoin de la loi 4', () => {
  /**
   * SANS LUI, on pourrait rendre TOUS les avatars cliquables, y compris ceux
   * des communautés et ceux déjà posés dans un lien. Un lien qui n'a pas de
   * destination légitime est un contrôle qui ment.
   */
  test('l’avatar reste un `<span>` muet', () => {
    const html = renderToStaticMarkup(<Avatar initials="AD" color="#4455ff" size={40} name="Ada" />);

    expect(html).not.toContain('<a ');
    expect(html).toContain('avatar-root');
  });
});

describe('avec un pseudo, il ouvre le profil', () => {
  test('un lien vers `/u/<pseudo>` enveloppe l’avatar', () => {
    const html = renderToStaticMarkup(<Avatar initials="AD" color="#4455ff" size={40} name="Ada" profileUsername="ada" />);

    expect(html).toContain('href="/u/ada"');
    expect(html).toContain('avatar-root');
  });

  /**
   * IL SE NOMME. Un lien dont le seul contenu est une image décorative est
   * annoncé « lien » et rien d'autre par un lecteur d'écran — l'utilisateur
   * entend une destination sans savoir laquelle.
   */
  test('il porte un nom accessible qui dit OÙ il mène', () => {
    const html = renderToStaticMarkup(
      <Avatar initials="AD" color="#4455ff" size={40} name="Ada Lovelace" profileUsername="ada" />,
    );

    expect(html).toContain('aria-label="Voir le profil de Ada Lovelace"');
  });

  /**
   * LA CIBLE TACTILE TIENT LE PLANCHER même sur un avatar de liste. Le témoin
   * interroge la CLASSE qui porte la règle, parce que `renderToStaticMarkup`
   * ne calcule aucune mise en page — c'est la feuille (`avatar.css`) qui pose
   * le pseudo-élément, et le gate navigateur qui mesure les pixels.
   */
  test('même à 24 px, il porte la classe qui étend la cible', () => {
    const html = renderToStaticMarkup(<Avatar initials="AD" color="#4455ff" size={24} name="Ada" profileUsername="ada" />);

    expect(html).toContain('avatar-profile-link');
  });

  /** Un pseudo VIDE n'est pas un pseudo : il produirait `/u/` — une adresse
      qui n'existe pas, donc un lien qui ment. */
  test('un pseudo vide ne fabrique aucun lien', () => {
    const html = renderToStaticMarkup(<Avatar initials="AD" color="#4455ff" size={40} name="Ada" profileUsername="" />);

    expect(html).not.toContain('<a ');
  });
});
