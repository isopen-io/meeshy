/**
 * Le scénario SANS TÊTE de la coquille « ami WhatsApp » (#17116) : ce que le
 * recetteur rejoue depuis une session cloud contre le staging. Prouvé ici contre
 * la doublure HTTP de la porte : il va au bout, s'arrête à la première étape qui
 * échoue en la nommant, et n'écrit jamais un secret ni un clair dans sa sortie.
 */
import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { openLibsignalBridge } from '@/lib/e2ee/libsignal-bridge';
import { LIBSIGNAL_WASM_FILE } from '@/lib/licences/libsignal-engine';

import { runCoquilleScenario, type ScenarioOptions } from './coquille-scenario';
import { createFakePorte, type FakePorteOptions } from './test-support/fake-porte';

const WEB_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const bridge = await openLibsignalBridge(readFileSync(join(WEB_ROOT, LIBSIGNAL_WASM_FILE)));

const PASSWORD = 'mot-de-passe-de-recette';
const TEAM = 'a1'.repeat(12);
const MEMBER = 'b2'.repeat(12);

const play = async (porteOptions: Partial<FakePorteOptions> = {}, scenario: Partial<ScenarioOptions> = {}) => {
  const porte = createFakePorte({
    accounts: { recette: { password: PASSWORD, userId: TEAM, role: 'MODERATOR' }, membre: { password: PASSWORD, userId: MEMBER, role: 'USER' } },
    ...porteOptions,
  });
  const lines: string[] = [];
  const report = await runCoquilleScenario({
    baseUrl: 'https://gate.staging.test',
    fetch: porte.fetch,
    bridge,
    account: { username: 'recette', password: PASSWORD },
    handle: '+447700900321',
    message: 'Message de recette 7f3a',
    reply: 'Réponse de l’ami 7f3a',
    log: (line) => lines.push(line),
    ...scenario,
  });
  return { report, lines, porte };
};

describe('le scénario sans tête de la coquille', () => {
  test('va au bout : Meeshy écrit, la coquille déchiffre et répond, Meeshy ouvre la réponse', async () => {
    const { report, lines, porte } = await play();

    expect(report.ok).toBe(true);
    expect(report.steps.map((step) => step.ok)).toEqual(report.steps.map(() => true));
    expect(report.steps.map((step) => step.name)).toEqual([
      'connexion du compte de recette',
      'la coquille est servie',
      'l’appareil Meeshy publie son bundle',
      'la coquille publie son bundle',
      'Meeshy écrit à l’ami',
      'le serveur refuse un clair',
      'la coquille reçoit un blob opaque et le déchiffre',
      'la coquille répond chiffré',
      'Meeshy ouvre la réponse',
    ]);
    expect(lines.at(-1)).toBe('SUCCÈS — 9/9 étapes');
    expect(porte.pendingCount()).toBe(0);
  });

  test('échoue, en le nommant, quand le serveur relaie un clair', async () => {
    const { report, lines } = await play({ acceptsPlaintext: true });

    expect(report.ok).toBe(false);
    expect(report.steps.at(-1)).toMatchObject({ name: 'le serveur refuse un clair', ok: false });
    expect(lines.at(-1)).toBe('ÉCHEC — étape 6/9 : le serveur refuse un clair');
  });

  test('dit qu’un compte hors de l’équipe est refusé, sans écrire son mot de passe ni son jeton', async () => {
    const { report, lines, porte } = await play({}, { account: { username: 'membre', password: PASSWORD } });

    expect(report.ok).toBe(false);
    expect(report.steps.at(-1)).toMatchObject({ name: 'l’appareil Meeshy publie son bundle', ok: false });
    expect(lines.join('\n')).toContain('EXTERNAL_PEER_TEAM_ONLY');
    expect(lines.join('\n')).not.toContain(PASSWORD);
    expect(lines.join('\n')).not.toContain(porte.tokenOf('membre'));
  });

  test('n’écrit jamais le clair du message dans sa sortie', async () => {
    const { lines } = await play();

    expect(lines.join('\n')).not.toContain('Message de recette 7f3a');
    expect(lines.join('\n')).not.toContain('Réponse de l’ami 7f3a');
  });
});
