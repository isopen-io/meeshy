/**
 * Le cliquet des promesses DÉTACHÉES — inventaire VIDE.
 *
 * La règle est écrite depuis la leçon 230, dans le `CLAUDE.md` de ce service :
 *
 * > **`void p` exige TOUJOURS `p.catch(...)`.** Un `void` DÉTACHE la promesse :
 * > le `try/catch` qui l'entoure n'attrape qu'un `throw` SYNCHRONE, jamais le
 * > rejet de la promesse rendue. Un rejet sans écouteur termine le PROCESS sous
 * > le `--unhandled-rejections=throw` par défaut de Node 22.
 *
 * Elle était écrite, expliquée, et appliquée avec soin sur les sites qui la
 * CITENT — `broadcastLinkMessage` la commente trois fois, `broadcastReadStatus`
 * une. **Rien ne la gardait**, et le balayage en a relevé QUATORZE
 * contre-exemples en production au cycle 130, dont deux dans le fichier même de
 * l'épingle et un dans le doc-comment qui affirmait « c'était ici la dernière
 * exception de la famille ».
 *
 * ── Pourquoi un cliquet, et pas seulement la règle ──────────────────────────
 *
 * Parce qu'aucun des quatorze n'était une panne LE JOUR de la mesure : les
 * callees avalaient tous leurs erreurs. C'est très exactement la forme d'un
 * piège armé (règle du cycle 84 : on ne laisse pas un piège armé au motif que
 * personne n'a encore marché dessus), et deux propriétés en font le prix :
 *
 * 1. **La garantie appartient au SITE, pas au collaborateur.** « Le callee
 *    avale ses erreurs » décrit l'autre bout, qui peut changer sans que le site
 *    d'appel rougisse — et c'est déjà faux dès que le callee porte UNE
 *    instruction avant son propre `try`. `onDisconnectGraceExpired` en avait
 *    trois, dont un accès de propriété sur un paramètre.
 * 2. **Cinq des quatorze vivaient dans un `setTimeout`.** Il n'y a alors aucun
 *    `try/catch` englobant à invoquer, et le rappel se déclenche longtemps après
 *    la requête qui l'a armé : le rejet n'a nulle part où être vu, et son seul
 *    effet observable est l'arrêt du process.
 *
 * **Quand ce témoin tombe** : un site NEUF vient d'entrer. La réparation est le
 * `.catch`, jamais une ligne dans un inventaire gelé — il n'y a pas de promesse
 * détachée non gardée légitime à porter, la forme juste étant toujours la même.
 *
 * @jest-environment node
 */

import { describe, it, expect } from '@jest/globals';
import { join } from 'path';

import { sweepDetachedPromises } from './detached-promise-catch-sweep';

const SRC_DIR = join(__dirname, '..');
const FIXTURES = join(__dirname, 'fixtures', 'detached-promise');

describe('promesses détachées — le rejet est gardé au SITE', () => {
  it('aucune promesse détachée sans `.catch` dans la production de la passerelle', () => {
    expect(sweepDetachedPromises(SRC_DIR)).toEqual([]);
  });

  /**
   * Le balayage lui-même est une AFFIRMATION, et se vérifie comme telle. Les
   * quatre formes de la fixture sont celles relevées en production : l'appel de
   * méthode nu, le chaînage optionnel, l'IIFE asynchrone, et l'appel armé dans
   * un `setTimeout`.
   */
  it('le balayage VOIT les quatre formes qu’il prétend interdire', () => {
    const hits = sweepDetachedPromises(FIXTURES).filter((h) => h.file === 'unguarded.ts');

    expect(hits.map((h) => h.expression)).toEqual([
      'svc.work()',
      'maybe?.work()',
      '(async () => { await svc.work(); })()',
      'svc.work()',
    ]);
  });

  /**
   * Et il ne prend pas la forme JUSTE pour la fautive — sans quoi la seule
   * façon de le rendre vert serait de cesser de détacher quoi que ce soit.
   *
   * `guarded.ts` porte aussi les deux `void` qui ne détachent RIEN : l'opérateur
   * sur une valeur (`void 0`) et le TYPE de retour (`(): void {`). Le second est
   * la forme qui rendait plus de cent faux positifs à la première rédaction —
   * un balayage qui cherche un MOT-CLÉ mesure sa popularité, pas une propriété
   * (cycle 107). Le discriminant retenu est la POSITION : `void` d'instruction
   * suit `;`, `{`, `}` ou le début du fichier ; `void` de type suit `:` ou `<`.
   */
  it('le balayage ne signale ni la forme gardée ni les `void` qui ne détachent rien', () => {
    expect(sweepDetachedPromises(FIXTURES).filter((h) => h.file === 'guarded.ts')).toEqual([]);
  });

  /**
   * La clé d'inventaire porte les LITTÉRAUX de l'appel.
   *
   * Le balayage détecte sur une source dépouillée (commentaires et contenus de
   * chaînes neutralisés) mais RAPPORTE depuis la source brute, aux mêmes
   * offsets. Sans cela, deux appels voisins au même helper ne différant que par
   * une chaîne — les deux `_enqueueOfflineReactionEvent` de `ReactionHandler`,
   * `'reaction-added'` contre `'reaction-removed'` — seraient indiscernables
   * dans l'inventaire.
   */
  it('la clé conserve les littéraux, pour que deux appels voisins se distinguent', () => {
    const hits = sweepDetachedPromises(FIXTURES).filter((h) => h.file === 'unguarded.ts');
    expect(hits[1].expression).toContain('maybe?.work');
  });
});
