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
 * Le même jour, le lot #10162 a rejoué le motif sur #10182 : « D22 (b)
 * tranchée sur #10182 », « Le porteur a tranché D22 en voie (b) » — alors que
 * l'unique commentaire de décision de #10182 se décrit lui-même « prise par la
 * session, à infirmer par le porteur » et liste le feu vert de `keptAt` parmi
 * ce qui reste à confirmer. La loi est la même ; la garde la tient donc par une
 * table, un cas par point ouvert.
 *
 * Quand le porteur aura tranché dans l'issue, le lot qui consigne sa réponse
 * retire le cas de la table et pose le statut définitif, en citant le
 * commentaire qui tranche. #11452 a été arbitré par le porteur le 2026-10-24
 * (issuecomment-6386322651) : son cas a quitté la table.
 *
 * @jest-environment node
 */

import { describe, it, expect } from '@jest/globals';
import { readFileSync } from 'fs';
import { join } from 'path';

const REPO_ROOT = join(__dirname, '../../../..');
const MAP = 'services/gateway/decisions.md';

type OpenDecision = Readonly<{
  record: string;
  openIssue: string;
  point: string;
}>;

const OPEN_DECISIONS: readonly OpenDecision[] = [
  {
    record:
      'services/gateway/decisions/2026-10-21-le-signal-immortalisee-voyage-par-l-identifiant-d-etape-seul-10162.md',
    openIssue: '#10182',
    point: 'registre #10162 — D22, le signal « immortalisée » (voie b)',
  },
  {
    record:
      'services/gateway/decisions/2026-10-21-un-palier-de-serie-ou-de-fidelite-se-paie-en-poche-et-un-compte-non-verifie-ne-le-touche-pas-au-prix-fort-10422.md',
    openIssue: '#10422',
    point: 'registre #10422 — la borne des gros poids portée aux paliers de série et de fidélité (option 1 + garde-fou)',
  },
];

const read = (relative: string): string => readFileSync(join(REPO_ROOT, relative), 'utf8');

const statusLine = (record: string): string =>
  record.split('\n').find((line) => line.startsWith('**Statut**')) ?? '';

const mapEntry = (map: string, openIssue: string): string =>
  map.split('\n').find((line) => line.includes(openIssue)) ?? '';

const claimsSettledBy = (text: string, openIssue: string): boolean =>
  new RegExp(`tranch[ée]e?[^\\n]{0,80}${openIssue}|${openIssue}[^\\n]{0,40}tranch`, 'i').test(text);

describe.each(OPEN_DECISIONS)(
  '$point attend l’arbitrage du porteur dans $openIssue',
  ({ record, openIssue }) => {
    it('le statut du registre présente la voie retenue comme une proposition en attente du porteur', () => {
      const status = statusLine(read(record));
      expect(status).toMatch(/proposition/i);
      expect(status).toMatch(/en attente de l['’]arbitrage du porteur/i);
      expect(claimsSettledBy(status, openIssue)).toBe(false);
    });

    it(`aucun paragraphe du registre ne dit que ${openIssue} a tranché`, () => {
      const settledParagraphs = read(record)
        .split('\n')
        .filter((line) => claimsSettledBy(line, openIssue));
      expect(settledParagraphs).toEqual([]);
    });

    it(`la carte des décisions présente le point ${openIssue} comme proposé, non tranché`, () => {
      const entry = mapEntry(read(MAP), openIssue);
      expect(entry).not.toBe('');
      expect(entry).toMatch(/propos(é|ition)/i);
      expect(claimsSettledBy(entry, openIssue)).toBe(false);
    });
  },
);
