/**
 * #5644 — un conteneur en retard sur ses routes doit se signaler avant
 * l'utilisateur. `evaluateDeployedRevision` est la règle PURE derrière
 * `scripts/check-deployed-revision.ts` : elle ne lit ni git ni le réseau,
 * elle reçoit ce qu'ils ont mesuré et rend un verdict.
 */
import { describe, it, expect } from '@jest/globals';

import { evaluateDeployedRevision } from '../../route-manifest/deployed-revision';

describe('evaluateDeployedRevision', () => {
  it('rend "a-jour" quand le SHA déployé est un ancêtre à moins du seuil de commits', () => {
    const résultat = evaluateDeployedRevision({
      isAncestor: true,
      commitsBehind: 3,
      maxCommitsBehind: 20,
    });

    expect(résultat.verdict).toBe('a-jour');
  });

  it('rend "a-jour" quand le SHA déployé EST la référence (0 commit de retard)', () => {
    const résultat = evaluateDeployedRevision({
      isAncestor: true,
      commitsBehind: 0,
      maxCommitsBehind: 20,
    });

    expect(résultat.verdict).toBe('a-jour');
  });

  it('rend "en-retard" au-delà du seuil, en le nommant dans la raison', () => {
    const résultat = evaluateDeployedRevision({
      isAncestor: true,
      commitsBehind: 41,
      maxCommitsBehind: 20,
    });

    expect(résultat.verdict).toBe('en-retard');
    expect(résultat.reason).toContain('41');
    expect(résultat.reason).toContain('20');
  });

  it('rend "en-retard" pile au seuil + 1 (limite exclusive)', () => {
    const résultat = evaluateDeployedRevision({
      isAncestor: true,
      commitsBehind: 21,
      maxCommitsBehind: 20,
    });

    expect(résultat.verdict).toBe('en-retard');
  });

  it('ne rend PAS "en-retard" pile au seuil (limite inclusive côté "a-jour")', () => {
    const résultat = evaluateDeployedRevision({
      isAncestor: true,
      commitsBehind: 20,
      maxCommitsBehind: 20,
    });

    expect(résultat.verdict).toBe('a-jour');
  });

  it('rend "divergent" quand le SHA déployé n\'est PAS un ancêtre de la référence, même avec un faible compte de commits', () => {
    const résultat = evaluateDeployedRevision({
      isAncestor: false,
      commitsBehind: 1,
      maxCommitsBehind: 20,
    });

    expect(résultat.verdict).toBe('divergent');
  });

  it('rend "inconnu" quand l\'ascendance n\'a pas pu être déterminée', () => {
    const résultat = evaluateDeployedRevision({
      isAncestor: null,
      commitsBehind: null,
      maxCommitsBehind: 20,
    });

    expect(résultat.verdict).toBe('inconnu');
  });

  it('rend "inconnu" quand seul le compte de commits manque', () => {
    const résultat = evaluateDeployedRevision({
      isAncestor: true,
      commitsBehind: null,
      maxCommitsBehind: 20,
    });

    expect(résultat.verdict).toBe('inconnu');
  });

  it('un verdict "en-retard" ou "divergent" est considéré en ALERTE ; "a-jour" et "inconnu" ne le sont pas seuls', () => {
    expect(evaluateDeployedRevision({ isAncestor: true, commitsBehind: 999, maxCommitsBehind: 20 }).isAlert).toBe(true);
    expect(evaluateDeployedRevision({ isAncestor: false, commitsBehind: 1, maxCommitsBehind: 20 }).isAlert).toBe(true);
    expect(evaluateDeployedRevision({ isAncestor: true, commitsBehind: 1, maxCommitsBehind: 20 }).isAlert).toBe(false);
  });
});
