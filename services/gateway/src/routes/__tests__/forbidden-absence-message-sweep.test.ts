/**
 * Le cliquet du #4856 : aucun `sendForbidden` du dépôt ne sert un message
 * d'ABSENCE.
 *
 * `services/gateway/decisions.md:640` explique pourquoi certaines routes
 * répondent délibérément 403 plutôt que 404, pour ne pas faire de la route un
 * oracle d'existence. Cinq sites — six, en comptant celui que ce balayage a
 * trouvé et que le relevé manuel de l'issue avait manqué (un ternaire dont une
 * seule branche fuyait) — contredisaient cette décision en nommant l'absence
 * dans le TEXTE du refus. Chacun a été tranché : #4856 explique pourquoi
 * `messages-search.ts` reste un 403 (l'identifiant de conversation est
 * SONDABLE) et pourquoi les quatre autres deviennent des 404 (l'absence porte
 * sur une ressource dont l'appelant a déjà PROUVÉ l'accès, ou qu'il ne peut
 * pas choisir — sa propre session).
 *
 * Inventaire VIDE, pas gelé : il n'y a pas de 403 « not found » légitime à
 * porter. Un site qui a vraiment besoin de dire « ça n'existe pas » sert 404.
 *
 * @jest-environment node
 */

import { describe, it, expect } from '@jest/globals';
import { join } from 'path';

import { scanForbiddenAbsenceMessages, sweepForbiddenAbsenceMessages } from './forbidden-absence-message-sweep';

const ROUTES_DIR = join(__dirname, '..');

describe('balayage — aucun 403 ne nomme une absence', () => {
  it('ne trouve aucun site dans les routes', () => {
    const actual = sweepForbiddenAbsenceMessages(ROUTES_DIR).map((s) => `${s.file}:${s.line}|${s.literal}`);

    expect(actual).toEqual([]);
  });
});

describe('balayage — ce qu’il discrimine', () => {
  it('signale un premier argument qui nomme l’absence, en anglais', () => {
    const source = `sendForbidden(reply, 'Conversation not found');`;

    expect(scanForbiddenAbsenceMessages(source, 'x.ts')).toEqual([
      { file: 'x.ts', line: 1, literal: 'Conversation not found' },
    ]);
  });

  it('signale un premier argument qui nomme l’absence, en français', () => {
    const source = `sendForbidden(reply, "Ce lien n'existe pas");`;

    expect(scanForbiddenAbsenceMessages(source, 'x.ts')).toEqual([
      { file: 'x.ts', line: 1, literal: "Ce lien n'existe pas" },
    ]);
  });

  it('trouve la branche fautive d’un TERNAIRE, même quand l’autre branche est sûre', () => {
    const source = `
      return sendForbidden(reply, isAnonymous ? 'Participant not found' : 'Access denied to this conversation');`;

    expect(scanForbiddenAbsenceMessages(source, 'x.ts')).toEqual([
      { file: 'x.ts', line: 2, literal: 'Participant not found' },
    ]);
  });

  it('laisse passer un refus générique qui ne nomme aucune ressource', () => {
    const source = `sendForbidden(reply, 'Access denied to this conversation');`;

    expect(scanForbiddenAbsenceMessages(source, 'x.ts')).toEqual([]);
  });

  it('ne prend pas « No … found » (résultat de LOT agrégé) pour une fuite d’existence', () => {
    const source = `sendForbidden(reply, 'No accessible messages found');`;

    expect(scanForbiddenAbsenceMessages(source, 'x.ts')).toEqual([]);
  });

  it('ne compte pas un appel cité dans un COMMENTAIRE', () => {
    const source = `
      // sendForbidden(reply, 'Conversation not found');
      sendForbidden(reply, 'Access denied to this conversation');`;

    expect(scanForbiddenAbsenceMessages(source, 'x.ts')).toEqual([]);
  });

  it('ignore un CODE opaque en MAJUSCULES, qui ne prononce aucune phrase', () => {
    const source = `sendForbidden(reply, 'NOT_A_PARTICIPANT');`;

    expect(scanForbiddenAbsenceMessages(source, 'x.ts')).toEqual([]);
  });
});
