/**
 * `utils/safe-regex` — la certification des motifs de `agent-topics`.
 *
 * Ces témoins vivent à côté de ceux des routes qui consomment le module, parce
 * qu'ils gardent la MÊME propriété : `POST /admin/agent/topics/:id/test`
 * exécute des expressions régulières fournies par l'appelant. La question
 * n'est pas « le module compile-t-il un motif ? » mais « le gateway
 * répond-il encore après ? ».
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';

import {
  analysePatternStatically,
  certifyPatterns,
  countMatchesOffLoop,
} from '../../../../utils/safe-regex';

// Le motif de manuel : `(a+)+` sur une chaîne de « a » suivie d'un caractère
// qui interdit l'ancre finale. En boucle d'événements, il fige le processus.
const CATASTROPHIC = '(a+)+$';

// Le motif SOURNOIS : il franchit l'analyse statique — ses deux branches ne se
// RESSEMBLENT pas, donc la disjonction approchée les croit distinctes — et il
// explose bel et bien, `\s` contenant la tabulation. C'est lui qui prouve que
// la sonde n'est pas décorative : elle refuse ce qu'aucune reconnaissance de
// forme n'a su nommer.
const SNEAKY = '(\\s|\\t)*$';

describe('analysePatternStatically — les classes refusées à l\'écriture', () => {
  it('accepte les motifs de mots-clés réels', () => {
    for (const pattern of ['\\bfilm\\b', '(?:film|série|cinéma)s?', '[A-Za-z]{2,10}', 'foot(ball)?']) {
      expect(analysePatternStatically(pattern)).toBeNull();
    }
  });

  it('refuse le quantificateur imbriqué', () => {
    expect(analysePatternStatically(CATASTROPHIC)?.code).toBe('NESTED_QUANTIFIER');
    expect(analysePatternStatically('(a*)*')?.code).toBe('NESTED_QUANTIFIER');
    expect(analysePatternStatically('(\\d+\\s*)+')?.code).toBe('NESTED_QUANTIFIER');
  });

  it('refuse l\'alternance ambiguë sous quantificateur', () => {
    expect(analysePatternStatically('(a|a)+')?.code).toBe('AMBIGUOUS_ALTERNATION');
    // Une branche VIDE rend le groupe annulable : le moteur peut itérer sans
    // consommer, c'est la forme la plus directe de l'explosion.
    expect(analysePatternStatically('(a|)*')?.code).toBe('AMBIGUOUS_ALTERNATION');
  });

  it('refuse une répétition bornée démesurée', () => {
    expect(analysePatternStatically('a{5000}')?.code).toBe('REPETITION_BUDGET');
    expect(analysePatternStatically('(a{40}){40}')?.code).toBe('REPETITION_BUDGET');
  });

  it('refuse un motif illisible et un motif interminable', () => {
    expect(analysePatternStatically('(unclosed')?.code).toBe('INVALID_SYNTAX');
    expect(analysePatternStatically('a'.repeat(201))?.code).toBe('TOO_LONG');
  });

  it('laisse passer ce qu\'elle ne sait pas voir — et le dit', () => {
    // Ce témoin GÈLE un AVEU, pas une réussite : le jour où l'analyse statique
    // apprend à refuser ce motif, il tombe, et la doctrine du module se met à
    // jour dans le même lot. Une limite qu'aucun témoin ne nomme se périme en
    // silence, et la sonde finit par passer pour un luxe.
    expect(analysePatternStatically(SNEAKY)).toBeNull();
  });
});

describe('certifyPatterns — la sonde hors boucle d\'événements', () => {
  it('certifie un motif de mot-clé sans rien refuser', async () => {
    await expect(certifyPatterns(['\\bfilm\\b', 'cinéma'])).resolves.toEqual([]);
  });

  it('refuse le motif catastrophique AVANT toute écriture', async () => {
    const refusals = await certifyPatterns([CATASTROPHIC]);
    expect(refusals).toHaveLength(1);
    expect(refusals[0].pattern).toBe(CATASTROPHIC);
  });

  it('refuse par MESURE ce que l\'analyse statique laisse passer', async () => {
    expect(analysePatternStatically(SNEAKY)).toBeNull();
    const refusals = await certifyPatterns([SNEAKY], { budgetMs: 200 });
    expect(refusals.map((r) => r.code)).toEqual(['BACKTRACKING_BUDGET']);
  }, 15000);

  it('ne rend pas la main à la boucle d\'événements pendant la mesure', async () => {
    // LA propriété du lot. Un minuteur armé à 20 ms doit tirer PENDANT que le
    // motif catastrophique brûle son budget : c'est la preuve que l'exécution
    // n'a pas lieu dans la boucle d'événements. Si elle y avait lieu, le
    // minuteur ne tirerait qu'APRÈS la fin du retour arrière — c'est-à-dire
    // jamais à l'échelle de ce test.
    const tick = jest.fn();
    const timer = setTimeout(tick, 20);
    // SNEAKY, et pas CATASTROPHIC : ce dernier est refusé par l'analyse
    // statique, donc `certifyPatterns` rend la main sans jamais rien exécuter
    // — le témoin passerait pour une raison qui ne prouve rien.
    await certifyPatterns([SNEAKY], { budgetMs: 300 });
    clearTimeout(timer);
    expect(tick).toHaveBeenCalled();
  }, 15000);

  /**
   * #4420 — le budget mesure ce que le MOTIF coûte, jamais ce que le FIL a
   * coûté à naître, ni ce que ses VOISINS ont pris.
   *
   * Le délai courait depuis `new Worker(..., { eval: true })`, dont le
   * démarrage — compilation de la source, levée d'un isolate V8 — se mesure à
   * une dizaine de millisecondes au repos et bien davantage sous charge. Les
   * 250 ms de `DEFAULT_PROBE_BUDGET_MS` étaient donc un budget « démarrage +
   * exécution de tous les motifs », alors qu'ils sont écrits, documentés et
   * testés comme un budget d'exécution. Quand le démarrage les épuisait,
   * AUCUN motif n'avait été annoncé — et la boucle de verdict refusait les
   * motifs les plus sains du dépôt avec le code d'un motif dangereux.
   *
   * Le témoin de cette propriété ne peut pas être une DURÉE : le défaut ne se
   * manifeste que lorsque le démarrage dépasse le budget, ce qui dépend de la
   * charge de la machine et ne se reproduit pas à volonté. Ce qui se prouve,
   * et qui suffit à interdire le retour du défaut, est que les deux délais
   * sont SÉPARÉS — un délai de démarrage réglable, dont le dépassement rend
   * une indisponibilité de mesure et non un verdict sur le motif. Remettre un
   * minuteur unique armé à la création du fil fait retomber ce témoin.
   */
  it("dit que la mesure est INDISPONIBLE, jamais qu'un motif sain a explosé, quand le fil ne démarre pas à temps", async () => {
    // Le sens de la panne ne change pas — ne pas pouvoir mesurer REFUSE
    // toujours. Ce qui change est la vérité du refus : `UNSUPPORTED_RUNTIME`
    // dit à l'administrateur que la machine n'a pas répondu ;
    // `BACKTRACKING_BUDGET` lui disait que son mot-clé explosait, et l'envoyait
    // réécrire un motif qui n'avait rien.
    const refusals = await certifyPatterns(['\\bfilm\\b'], { startupBudgetMs: 0 });
    expect(refusals.map((r) => r.code)).toEqual(['UNSUPPORTED_RUNTIME']);
  }, 15000);
});

describe('countMatchesOffLoop — l\'exécution sur le texte de l\'appelant', () => {
  it('compte les occurrences d\'un motif sain', async () => {
    const { matches, refused } = await countMatchesOffLoop(['\\bfilm\\b'], 'un film, deux film');
    expect(matches['\\bfilm\\b']).toBe(2);
    expect(refused).toEqual([]);
  });

  it('rend -1 et le motif fautif quand un motif STOCKÉ dépasse le délai', async () => {
    // Les motifs déjà en base n'ont jamais été certifiés : garder la porte
    // sans garder la salle laisserait figer le gateway avec un motif écrit
    // hier. Le compte rendu NOMME le fautif au lieu de refuser les dix.
    const { matches, refused } = await countMatchesOffLoop(
      [CATASTROPHIC],
      `${'a'.repeat(60)}!`,
      { budgetMs: 120 },
    );
    expect(matches[CATASTROPHIC]).toBe(-1);
    expect(refused.map((r) => r.code)).toEqual(['BACKTRACKING_BUDGET']);
  }, 15000);

  it('rend -1 sur un motif illisible sans perdre ses voisins', async () => {
    const { matches, refused } = await countMatchesOffLoop(['(unclosed', 'film'], 'un film');
    expect(matches['(unclosed']).toBe(-1);
    expect(matches['film']).toBe(1);
    expect(refused.map((r) => r.code)).toEqual(['INVALID_SYNTAX']);
  }, 15000);
});
