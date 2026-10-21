/**
 * Une issue `décision-produit` assignée au porteur se tranche DANS l'issue,
 * jamais dans un registre de décision (CLAUDE.md § Pilotage du développement).
 *
 * Le lot #11452 (2026-10-21) a écrit « le point ouvert … est tranché … par
 * #11452 : voie 1 » dans le registre de #11441 et dans la carte des décisions,
 * alors que l'issue, ouverte, labellisée `décision-produit`, assignée au
 * porteur, ne portait AUCUN commentaire : c'est l'agent qui avait choisi la
 * voie 1 et l'attribuait à l'issue. Tant que le porteur n'a pas répondu, le
 * registre porte une PROPOSITION, en attente de son arbitrage.
 *
 * Cette garde tient le registre dans cet état. Quand le porteur aura tranché
 * dans #11452, le lot qui consigne sa réponse remplace cette garde par le
 * statut définitif, en citant le commentaire qui tranche.
 *
 * @jest-environment node
 */

import { describe, it, expect } from '@jest/globals';
import { readFileSync } from 'fs';
import { join } from 'path';

const REPO_ROOT = join(__dirname, '../../../..');
const RECORD =
  'services/gateway/decisions/2026-10-21-les-operations-serveur-s-ouvrent-au-rang-d-administration-11441.md';
const MAP = 'services/gateway/decisions.md';
const ISSUE = '#11452';

const read = (relative: string): string => readFileSync(join(REPO_ROOT, relative), 'utf8');

const statusLine = (record: string): string =>
  record.split('\n').find((line) => line.startsWith('**Statut**')) ?? '';

const mapEntry = (map: string): string =>
  map.split('\n').find((line) => line.includes(ISSUE)) ?? '';

const claimsSettledBy = (text: string): boolean =>
  /tranch[ée]e?[^\n]{0,80}#11452|#11452[^\n]{0,40}tranch/i.test(text);

describe('registre #11441 — le point ouvert #11452 attend l’arbitrage du porteur', () => {
  it('le statut du registre présente la voie 1 comme une proposition en attente du porteur', () => {
    const status = statusLine(read(RECORD));
    expect(status).toMatch(/proposition/i);
    expect(status).toMatch(/en attente de l['’]arbitrage du porteur/i);
    expect(claimsSettledBy(status)).toBe(false);
  });

  it('aucun paragraphe du registre ne dit que #11452 a tranché', () => {
    const settledParagraphs = read(RECORD)
      .split('\n')
      .filter((line) => claimsSettledBy(line));
    expect(settledParagraphs).toEqual([]);
  });

  it('la carte des décisions présente le point #11452 comme proposé, non tranché', () => {
    const entry = mapEntry(read(MAP));
    expect(entry).not.toBe('');
    expect(entry).toMatch(/propos(é|ition)/i);
    expect(claimsSettledBy(entry)).toBe(false);
  });
});
