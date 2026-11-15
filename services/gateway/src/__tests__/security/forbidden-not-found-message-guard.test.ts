/**
 * Le cliquet des refus 403 dont le TEXTE dit « not found » — inventaire VIDE
 * (#4856).
 *
 * > Un statut et un texte sont deux réponses à la même question, et rien ne
 * > les confronte. Un 403 posé pour ne pas dire si une ressource existe,
 * > accompagné d'un texte qui la nomme absente, dit exactement ce que le
 * > statut refusait de dire — à qui lit le corps, c'est-à-dire à tout le
 * > monde.
 *
 * Six sites vivaient dans ce cas (cinq relevés par l'issue, un sixième —
 * `attachments/metadata.ts`, ternaire de la galerie anonyme — trouvé par ce
 * balayage lui-même). Chacun est tranché par la question de l'issue : *ce
 * que l'appelant apprendrait en distinguant « absent » de « pas pour toi »
 * a-t-il une valeur pour un attaquant ?* Dans les six, non — la ressource
 * recherchée est soit un identifiant qui ne résout à AUCUNE ligne (rien à
 * énumérer), soit la ligne propre de l'APPELANT (son `User`, son
 * `Participant` de session, son lien de partage). Les six sont désormais des
 * `sendNotFound` (404).
 *
 * **Quand ce témoin tombe** : un site NEUF vient d'entrer. Trancher
 * site par site (jamais en bloc) entre les deux issues de l'issue : le 403
 * est délibéré (anti-énumération) ⇒ le message cesse de nommer l'absence ;
 * le 403 est un accident ⇒ c'est un 404, décrit dans le bloc `response:` de
 * la route. Il n'y a pas de 403 « not found » légitime à porter.
 *
 * @jest-environment node
 */

import { describe, it, expect } from '@jest/globals';
import { join } from 'path';

import { sweepForbiddenAbsenceMessages } from './forbidden-not-found-message-guard';

const SRC_DIR = join(__dirname, '..', '..');
const FIXTURES = join(__dirname, 'fixtures', 'forbidden-not-found');

describe('sendForbidden — aucun texte ne nomme une absence', () => {
  it('aucun `sendForbidden` de production ne sert un message « not found » / « introuvable »', () => {
    expect(sweepForbiddenAbsenceMessages(SRC_DIR)).toEqual([]);
  });

  /**
   * Le balayage lui-même est une AFFIRMATION, et se vérifie comme telle :
   * les quatre formes relevées en production (idiome anglais, `introuvable`,
   * négation existentielle française, appel étalé sur plusieurs lignes).
   */
  it('le balayage VOIT les formes qu’il prétend interdire', () => {
    const hits = sweepForbiddenAbsenceMessages(FIXTURES).filter((h) => h.file === 'unguarded.ts');

    expect(hits.map((h) => h.message)).toEqual([
      'Conversation not found',
      'Lien introuvable',
      "Cet utilisateur n'existe pas",
      'Share link not found',
    ]);
  });

  /**
   * Et il ne prend pas la forme JUSTE pour la fautive : un vrai refus de
   * droit, un `sendNotFound` (le comportement voulu), un message composé à
   * l'exécution (hors de portée par construction), et une CITATION en
   * commentaire — qui ne doit jamais se lire comme un site de production.
   */
  it('le balayage ne signale ni un vrai refus, ni `sendNotFound`, ni un message dynamique, ni une citation en commentaire', () => {
    expect(sweepForbiddenAbsenceMessages(FIXTURES).filter((h) => h.file === 'guarded.ts')).toEqual([]);
  });
});
