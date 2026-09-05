/**
 * @jest-environment node
 */

import { adresseAutourDuMessage, adresseDuPlein, adresseDuRetourDuPlein } from '@/lib/api/adresses-du-fil';

/**
 * LE SÉPARATEUR DE `adresseAutourDuMessage` S'ADAPTE À CE QUI EST DÉJÀ LÀ.
 *
 * Chaque appelant historique (`app/connecte/fil-lignes.ts`,
 * `lib/realtime/fil-peinture.ts`) passe une adresse hôte NUE
 * (`adresseDeLaPorte`, sans `?`) — d'où la règle `?` d'origine, qui composait
 * juste TANT QUE l'appelant respectait ce contrat implicite.
 *
 * La galerie des médias (`app/connecte/medias-vue.ts`, défaut majeur #5024
 * point 2) casse ce contrat : sa propre adresse porte déjà `?genre=` sous un
 * filtre actif. Avec l'ancienne règle (`${adresse}?${…}`), la composition
 * produisait un second `?` — `/chats/c1/medias?genre=image?autour=r1` — que
 * `new URL(...).searchParams` ne coupe QUE sur `&`, jamais sur `?` en second
 * rang : `autour=r1` finissait comme une queue collée à la VALEUR de
 * `genre`, et `searchParams.get('autour')` rendait `null`. Le lien de plein
 * écran de la galerie se serait rouvert sur le fil ENTIER (les 40 derniers
 * messages), la pièce demandée hors de cette tranche.
 */
describe('adresseAutourDuMessage s’adapte au séparateur déjà présent', () => {
  it('pose `?` sur une adresse hôte NUE — le contrat historique, inchangé', () => {
    expect(adresseAutourDuMessage('/chats/c1', 'r1')).toBe('/chats/c1?autour=r1');
  });

  it('pose `&`, jamais un second `?`, sur une adresse qui porte déjà une requête', () => {
    const compose = adresseAutourDuMessage('/chats/c1/medias?genre=image', 'r1');
    expect(compose).toBe('/chats/c1/medias?genre=image&autour=r1');
    expect(compose.match(/\?/g)).toHaveLength(1);
  });

  /** La preuve DIRECTE du bogue évité : `autour=` doit rester LISIBLE par `URL().searchParams`. */
  it('reste lisible par URL().searchParams une fois composée sur une adresse filtrée', () => {
    const compose = adresseAutourDuMessage('/chats/c1/medias?genre=image', 'r1');
    const params = new URL(`https://exemple.test${compose}`).searchParams;
    expect(params.get('genre')).toBe('image');
    expect(params.get('autour')).toBe('r1');
  });
});

describe('adresseDuPlein et adresseDuRetourDuPlein héritent du même séparateur adaptatif', () => {
  it('compose `?autour=&media=` sur une adresse déjà filtrée, sans second `?`', () => {
    const ouverture = adresseDuPlein('/chats/c1/medias?genre=image', 'r1', 'a1');
    expect(ouverture).toBe('/chats/c1/medias?genre=image&autour=r1&media=a1');
    const params = new URL(`https://exemple.test${ouverture}`).searchParams;
    expect(params.get('media')).toBe('a1');
  });

  it('le retour garde le même filtre, cadré sur le message et l’ancre du fragment', () => {
    expect(adresseDuRetourDuPlein('/chats/c1/medias?genre=image', 'r1')).toBe(
      '/chats/c1/medias?genre=image&autour=r1#m-r1',
    );
  });
});
