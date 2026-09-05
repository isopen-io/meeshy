/**
 * @jest-environment node
 */

import { CAUSES_DE_CLOTURE, type CauseDeCloture } from '@/lib/api/links';
import { etatDeCloture } from '@/app/(public)/l/[token]/expired/etats';

/**
 * Les états de `/l/:token/expired` — la copie et les DEUX suites.
 *
 * Le critère de fin de #4496 tient en deux moitiés qu'un seul message générique
 * ne peut pas servir : chaque refus dit sa RAISON, et chaque raison propose la
 * SUITE qui lui correspond. « Demander un nouveau lien » sur une conversation
 * CLOSE est un contrôle qui n'a aucun effet — un nouveau lien ne rouvre pas un
 * fil terminé — c'est-à-dire exactement la loi 4 (« un contrôle existe s'il a un
 * effet ») retournée contre l'écran qui la cite.
 *
 * Ce module est une TABLE : aucune donnée du réseau n'y entre, le jeton excepté.
 * C'est ce qui rend vérifiable la seconde exigence de l'issue — « aucune
 * information révélant l'existence ou non de la conversation derrière le lien ».
 */

const JETON = '8fz3-lagos';

const etat = (cause: CauseDeCloture) => etatDeCloture({ cause, token: JETON });

const TOUTES = CAUSES_DE_CLOTURE;

describe('etatDeCloture — chaque refus dit sa raison', () => {
  it('couvre les six causes, sans trou ni doublon de titre', () => {
    const titres = TOUTES.map((cause) => etat(cause).titre);

    expect(TOUTES).toHaveLength(6);
    expect(new Set(titres).size).toBe(6);
  });

  it('rend un statut, un en-tête et un corps propres à chaque cause', () => {
    expect(new Set(TOUTES.map((c) => etat(c).statut)).size).toBe(6);
    expect(new Set(TOUTES.map((c) => etat(c).entete)).size).toBe(6);
    expect(new Set(TOUTES.map((c) => etat(c).corps)).size).toBe(6);
  });

  it('nomme les quatre refus par ce qu’ils sont, pas par un mot fourre-tout', () => {
    expect(etat('expiration').titre).toContain('expiré');
    expect(etat('desactivation').titre).toContain('fermé');
    expect(etat('epuisement').titre).toContain('limite');
    expect(etat('conversation-terminee').titre).toContain('conversation');
  });

  it('propose TOUJOURS deux suites, chacune avec une adresse réelle', () => {
    for (const cause of TOUTES) {
      const { principal, secondaire } = etat(cause);

      expect(principal.libelle.length).toBeGreaterThan(0);
      expect(secondaire.libelle.length).toBeGreaterThan(0);
      expect(principal.href).not.toBe('');
      expect(secondaire.href).not.toBe('');
      expect(principal.href).not.toBe('#');
      expect(secondaire.href).not.toBe('#');
    }
  });

  it('garde le lien de côté : la connexion revient à l’adresse d’origine', () => {
    expect(etat('expiration').principal.href).toBe(`/login?next=%2Fl%2F${JETON}`);
  });

  it('échappe le jeton avant de le poser dans une adresse', () => {
    const { principal } = etatDeCloture({ cause: 'expiration', token: 'a b/c' });

    expect(principal.href).toBe('/login?next=%2Fl%2Fa%20b%2Fc');
  });

  /**
   * La suite d'une conversation CLOSE n'est pas un nouveau lien : le lien n'est
   * pour rien dans son état. Proposer d'en redemander un serait un contrôle
   * inerte — celui que la conception traque depuis le cycle 123.
   */
  it('ne propose pas un nouveau lien quand c’est la CONVERSATION qui est close', () => {
    const { secondaire } = etat('conversation-terminee');

    expect(secondaire.libelle).not.toContain('nouveau lien');
    expect(secondaire.href).toBe('/');
  });

  it('propose un nouveau lien quand c’est le LIEN qui est fini', () => {
    for (const cause of ['expiration', 'desactivation', 'epuisement'] as const) {
      expect(etat(cause).secondaire.libelle).toContain('nouveau lien');
      expect(etat(cause).secondaire.href.startsWith('mailto:')).toBe(true);
    }
  });

  it('propose un nouveau lien même quand la cause n’est pas nommée', () => {
    const { corps, secondaire } = etat('indeterminee');

    expect(corps).toContain('peut-être');
    expect(secondaire.href.startsWith('mailto:')).toBe(true);
  });

  /**
   * LA LOI 4 SUR LA SUITE LA PLUS FACILE À RENDRE INERTE.
   *
   * « Réessayer ce lien » pointe `/l/:token` — la porte d'où l'on VIENT, qui
   * redirige ICI dès que la résolution dit le lien clos. Une seule situation
   * l'autorise : celle où la v3 n'a PAS jugé le lien clos, donc où la porte rend
   * autre chose (la redirection vers la cible, ou l'écran 503). Partout ailleurs
   * c'est une boucle payée de deux allers-retours sur un téléphone en 3G.
   */
  it('ne renvoie vers /l/:token QUE lorsque le lien n’a pas été jugé clos', () => {
    const retour = `/l/${JETON}`;

    expect(etat('verification-impossible').secondaire.href).toBe(retour);
    for (const cause of TOUTES.filter((c) => c !== 'verification-impossible')) {
      expect(etat(cause).secondaire.href).not.toBe(retour);
    }
  });

  it('sépare « on n’a pas pu vérifier » de « le lien est fini »', () => {
    expect(etat('verification-impossible').titre).not.toContain('expiré');
    expect(etat('verification-impossible').statut).toBe('Non vérifié');
    expect(etat('indeterminee').statut).toBe('Indéterminé');
  });

  it('ne compose sa copie qu’à partir de constantes — le réseau n’y entre pas', () => {
    for (const cause of TOUTES) {
      const { titre, corps, statut, entete } = etat(cause);

      expect(`${titre}${corps}${statut}${entete}`).not.toContain(JETON);
    }
  });
});
