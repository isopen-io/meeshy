/**
 * @jest-environment node
 */

/**
 * `/feed/reels` — LE FIL DE RÉELS CONNECTÉ (#5032).
 *
 * **LE CRITÈRE DE FIN DE LA MATRICE EST UN TÉMOIN DE SOURCE, ET IL FAUT DIRE
 * POURQUOI.** « Un SEUL composant lecteur sert la route publique et la route
 * connectée (aucune jumelle) » n'est pas une affirmation sur ce qu'un document
 * CONTIENT : deux lecteurs recopiés rendraient, le jour de leur écriture, un
 * HTML identique — et un témoin de sortie sortirait vert sur la jumelle même
 * qu'il doit interdire. Ce qui se garde est la STRUCTURE : la porte du fil
 * appelle-t-elle les MÊMES fonctions que celle du partage, ou en a-t-elle
 * écrit d'autres ?
 *
 * C'est l'exception assumée à « tester le comportement, pas l'implémentation » :
 * ici l'implémentation EST le critère, et il n'a pas d'autre trace observable.
 * Le comportement, lui, est gardé par les témoins de sortie ci-dessous et par
 * `e2e/visual/v3-reels-du-fil.spec.ts`.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * LE CODE, SANS SES COMMENTAIRES — et ce n'est pas une précaution de confort.
 * Les doc-comments de ce lot NOMMENT le motif qu'il corrige
 * (« `adresseDeLaStory(cible)` composait… ») : un témoin qui lit le fichier
 * brut rougirait sur l'explication du correctif, c'est-à-dire sur la seule
 * trace qui empêche quelqu'un de le défaire. Un garde de SOURCE doit lire ce
 * que la machine exécute, jamais ce que l'auteur raconte.
 */
const sansCommentaires = (source: string): string =>
  source.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1');

const lis = (chemin: string): string =>
  sansCommentaires(readFileSync(join(__dirname, '..', chemin), 'utf8'));

const PORTE_DU_FIL = lis('app/connecte/reels-porte.ts');
const PORTE_DU_PARTAGE = lis('app/(public)/partage-porte.ts');

describe('un seul lecteur sert les deux routes', () => {
  /**
   * LES DEUX FONCTIONS QUI FONT LE LECTEUR : `partageLu` descend le Prisme et
   * compose la `Story` ; `documentDuPartage` la rend. Si la porte du fil les
   * appelle toutes les deux, elle ne peut pas avoir de jumelle — il n'y a rien
   * d'autre à dupliquer.
   */
  it.each(['partageLu', 'documentDuPartage'])('la porte du fil appelle %s, comme celle du partage', (fonction) => {
    expect(PORTE_DU_PARTAGE).toContain(fonction);
    expect(PORTE_DU_FIL).toContain(fonction);
  });

  /**
   * ET ELLE N'EN COMPOSE AUCUN AUTRE. Un `documentPleinEcran` ou un
   * `<section class="scene"` écrit ici serait exactement la jumelle : un
   * second lecteur qui commence par ressembler au premier.
   */
  it.each(['documentPleinEcran', '<section', '<figure', 'story-tete'])(
    'la porte du fil ne compose aucun HTML de lecteur (%s)',
    (marque) => {
      expect(PORTE_DU_FIL).not.toContain(marque);
    },
  );

  /**
   * LE GENRE VIENT DE LA SOURCE UNIQUE, jamais d'un littéral `'REEL'` écrit
   * ici : `GENRE_REEL` porte le préfixe d'adresse, le vocabulaire et
   * `avecSegments` — trois choses qu'un littéral perdrait en silence.
   */
  it('nomme son genre par la constante partagée', () => {
    expect(PORTE_DU_FIL).toContain('GENRE_REEL');
    expect(PORTE_DU_FIL).not.toMatch(/genre:\s*'REEL'/);
  });
});

/**
 * `/feed/reels` A UNE PORTE — leçon 507, appliquée au lot suivant. Un écran
 * servi sans lien entrant est le contrôle sans effet pris par l'autre bout, et
 * la table de navigation de la planche dit exactement où la porte se pose :
 * « feed → reels, Réels, bouton » (`MeeshyWebV3.dc.html:870`).
 */
describe('le fil de réels est atteignable', () => {
  it('le fil social porte un lien vers /feed/reels', () => {
    expect(lis('app/connecte/social-vue.ts')).toContain('href="/feed/reels"');
  });

  /** Et la croix du lecteur remonte AU FIL, pas à l'accueil (`:871`). */
  it('la porte du fil pose son retour vers /feed', () => {
    expect(PORTE_DU_FIL).toContain("retourDeLEcran: '/feed'");
  });
});

/**
 * LE VOISINAGE PORTE DES ADRESSES (#5032) — et ce témoin garde le CORRECTIF,
 * pas seulement la nouveauté. `tap()` composait `adresseDeLaStory(cible)` en
 * dur : un voisinage de réels aurait envoyé vers `/stories/<id>`. Le défaut
 * était dormant ; le fil de réels le réveille.
 */
describe('le lecteur pose l’adresse qu’on lui donne', () => {
  const VUE = lis('app/(public)/partage-vue.ts');

  it('le tap ne compose plus aucune adresse', () => {
    expect(VUE).toContain('href="${echappe(cible)}"');
    expect(VUE).not.toContain('adresseDeLaStory(cible)');
  });

  /**
   * LE MÊME DÉFAUT, VIVANT CELUI-LÀ : le `returnUrl` de l'invitation renvoyait
   * un visiteur de `/reels/:id` vers `/stories/<id>` après connexion.
   */
  it('l’invitation renvoie vers l’adresse du GENRE, pas vers celle d’une story', () => {
    expect(VUE).toContain('adresseDuPartage(genre, id)');
    expect(VUE).not.toContain('adresseDeLaStory(id)');
  });
});
