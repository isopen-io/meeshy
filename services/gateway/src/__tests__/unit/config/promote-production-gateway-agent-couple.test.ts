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
import fs from 'fs';
import os from 'os';
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
    ['rollback', ['gateway', 'agent', 'gateway']],
    ['plan', [`gateway=${D1}`]],
  ])('refuse « %s %s » : l’un sans l’autre', (action, mots) => {
    const r = valider(action, ...mots);
    expect(r.status).toBe(RC_REFUS);
    expect(r.stderr).toMatch(/passerelle et (l’|l')agent|demandé deux fois/);
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

describe('retour arrière du couple : il suit la dernière promotion, et ne mute rien s’il est incomplet (#10290, audit)', () => {
  const G_PREV = `isopen/meeshy-gateway@sha256:${'1'.repeat(64)}`;
  const A_PREV = `isopen/meeshy-agent@sha256:${'2'.repeat(64)}`;

  function planRetour(state: Record<string, string>, ...services: string[]) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'promotion-state-'));
    for (const [file, content] of Object.entries(state)) fs.writeFileSync(path.join(dir, file), `${content}\n`);
    const r = spawnSync(BASH, [SCRIPT, '__plan_retour', ...services], { encoding: 'utf8', env: { ...process.env, MEESHY_PROMOTION_STATE: dir } });
    fs.rmSync(dir, { recursive: true, force: true });
    return r;
  }

  it("ne fait RIEN pour l'agent resté inchangé à la dernière promotion, et ramène la passerelle", () => {
    const r = planRetour({ 'previous.gateway': G_PREV, 'tx.gateway': 'promu', 'previous.agent': A_PREV, 'tx.agent': 'inchange' }, 'gateway', 'agent');
    expect(r.status).toBe(0);
    expect(r.stdout).toContain(`RETOUR_PLAN service=gateway action=revenir vers=${G_PREV}`);
    expect(r.stdout).toContain('RETOUR_PLAN service=agent action=rien');
    expect(r.stdout).not.toContain(A_PREV);
  });

  it('refuse TOUT le retour (aucune mutation) si un service à revenir n’a pas de précédent noté', () => {
    const r = planRetour({ 'previous.gateway': G_PREV }, 'gateway', 'agent');
    expect(r.status).toBe(RC_REFUS);
    expect(r.stdout).not.toContain('RETOUR_PLAN service=gateway');
  });

  it('ramène les deux quand les deux ont basculé (ou état antérieur à #10290, sans marque)', () => {
    for (const state of [
      { 'previous.gateway': G_PREV, 'previous.agent': A_PREV, 'tx.gateway': 'promu', 'tx.agent': 'promu' },
      { 'previous.gateway': G_PREV, 'previous.agent': A_PREV },
    ]) {
      const r = planRetour(state, 'gateway', 'agent');
      expect(r.status).toBe(0);
      expect(r.stdout).toContain(`vers=${G_PREV}`);
      expect(r.stdout).toContain(`vers=${A_PREV}`);
    }
  });
});
