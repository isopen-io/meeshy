/**
 * #10290 — la promotion en production ne bascule jamais la passerelle sans l'agent, ni l'inverse.
 *
 * Passerelle et agent partagent un protocole qui évolue ensemble : secret interne des routes HTTP
 * (#10242), canal ZMQ signé (#10288), routes de saison (#10246). Un agent récent derrière une
 * passerelle ancienne rejette tous ses événements ; une passerelle récente devant un agent ancien
 * appelle des routes qu'il ne sert pas. `infrastructure/scripts/meeshy-promote-production.sh`
 * refuse donc, dès la grammaire et avant toute mutation, une demande qui n'en porte qu'un.
 *
 * Le témoin exécute le VRAI script (`__valider`, sans Docker) : bash ≥ 4 requis (tableaux associatifs).
 *
 * @jest-environment node
 */

import { spawnSync } from 'child_process';
import path from 'path';

const SCRIPT = path.resolve(__dirname, '..', '..', '..', '..', '..', '..', 'infrastructure', 'scripts', 'meeshy-promote-production.sh');
const BASH = ['/opt/homebrew/bin/bash', '/usr/local/bin/bash', '/bin/bash', 'bash'].find((b) => spawnSync(b, ['-c', '[ "${BASH_VERSINFO[0]}" -ge 4 ]']).status === 0) ?? 'bash';
const D1 = `sha256:${'a'.repeat(64)}`;
const D2 = `sha256:${'b'.repeat(64)}`;
const RC_REFUS = 64;

function valider(...mots: string[]) {
  return spawnSync(BASH, [SCRIPT, '__valider', ...mots], { encoding: 'utf8' });
}

describe('promotion en production : passerelle et agent ensemble (#10290)', () => {
  it.each([
    ['promote', [`gateway=${D1}`]],
    ['promote', [`agent=${D1}`]],
    ['promote', [`gateway=${D1}`, `webapp=${D2}`]],
    ['rollback', ['gateway']],
    ['rollback', ['agent']],
    ['plan', [`gateway=${D1}`]],
  ])('refuse « %s %s » : l’un sans l’autre', (action, mots) => {
    const r = valider(action, ...mots);
    expect(r.status).toBe(RC_REFUS);
    expect(r.stderr).toMatch(/passerelle et (l’|l')agent/);
  });

  it.each([
    ['promote', [`gateway=${D1}`, `agent=${D2}`]],
    ['promote', [`agent=${D2}`, `gateway=${D1}`, `webapp=${D2}`]],
    ['rollback', ['gateway', 'agent']],
    ['promote', [`webapp=${D2}`]],
    ['promote', [`translator=${D2}`]],
    ['rollback', ['webapp']],
  ])('accepte « %s %s »', (action, mots) => {
    expect(valider(action, ...mots).status).toBe(0);
  });

  it('le self-test du script passe', () => {
    const r = spawnSync(BASH, [SCRIPT, '--self-test'], { encoding: 'utf8', env: { ...process.env, PATH: `${path.dirname(BASH)}:${process.env.PATH}` } });
    expect(r.stdout + r.stderr).toMatch(/toutes les vérifications passées/);
    expect(r.status).toBe(0);
  });
});
