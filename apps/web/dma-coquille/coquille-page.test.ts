/**
 * La page de la coquille « ami WhatsApp » (#17116) : le recetteur s'y connecte
 * avec un compte de l'équipe, relève le message d'un appareil Meeshy, le lit en
 * clair sur la page (et nulle part ailleurs) et répond chiffré.
 */
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { openLibsignalBridge } from '@/lib/e2ee/libsignal-bridge';
import { LIBSIGNAL_WASM_FILE } from '@/lib/licences/libsignal-engine';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { createCoquilleDevice } from './coquille-device';
import { mountCoquillePage } from './coquille-page';
import { createPorteClient, type ExternalParty, type MeeshyParty } from './porte-client';
import { createFakePorte } from './test-support/fake-porte';

const WEB_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const bridge = await openLibsignalBridge(readFileSync(join(WEB_ROOT, LIBSIGNAL_WASM_FILE)));

const TEAM = 'a1'.repeat(12);
const HANDLE = '+447700900555';
const meeshy: MeeshyParty = { side: 'meeshy', userId: TEAM, deviceId: 9 };
const friend: ExternalParty = { side: 'external', network: 'whatsapp', handle: HANDLE, deviceId: 1 };

beforeAll(() => ensureHappyDomRegistered());
afterAll(async () => releaseHappyDomIfRegistered());

const settle = async (until: () => boolean): Promise<void> => {
  const deadline = Date.now() + 5000;
  while (!until()) {
    if (Date.now() > deadline) throw new Error('la page n’a pas atteint l’état attendu');
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
};

const field = (root: HTMLElement, label: string): HTMLInputElement => {
  const element = Array.from(root.querySelectorAll('label')).find((candidate) => candidate.textContent?.trim() === label);
  const input = element ? root.querySelector<HTMLInputElement>(`#${element.htmlFor}`) : null;
  if (!input) throw new Error(`champ « ${label} » sans libellé`);
  return input;
};

const button = (root: HTMLElement, name: string): HTMLButtonElement => {
  const found = Array.from(root.querySelectorAll('button')).find((candidate) => candidate.textContent?.trim() === name);
  if (!found) throw new Error(`bouton « ${name} » absent`);
  return found;
};

const type = (input: HTMLInputElement, value: string): void => {
  input.value = value;
  input.dispatchEvent(new Event('input', { bubbles: true }));
};

describe('la page de la coquille', () => {
  test('se connecte, relève et déchiffre le message de Meeshy, puis répond chiffré', async () => {
    const porte = createFakePorte({ accounts: { recette: { password: 'secret-de-test', userId: TEAM, role: 'MODERATOR' } } });
    const root = document.createElement('main');
    document.body.append(root);
    mountCoquillePage(root, { origin: 'https://gate.staging.test', fetch: porte.fetch, openBridge: async () => bridge });

    type(field(root, 'Identifiant de l’équipe'), 'recette');
    type(field(root, 'Mot de passe'), 'secret-de-test');
    type(field(root, 'Numéro WhatsApp simulé'), HANDLE);
    button(root, 'Ouvrir la coquille').click();
    await settle(() => root.textContent?.includes(`Coquille ouverte : ${HANDLE}, appareil 1`) ?? false);

    const me = await createCoquilleDevice({ bridge, porte: createPorteClient({ baseUrl: 'https://gate.staging.test', token: porte.tokenOf('recette'), fetch: porte.fetch }), party: meeshy });
    await me.publish();
    await me.send(friend, 'Bonjour l’ami');
    button(root, 'Relever les messages').click();
    await settle(() => root.querySelector('[data-message]')?.textContent?.includes('Bonjour l’ami') ?? false);

    type(field(root, 'Réponse'), 'Bonjour Meeshy');
    button(root, 'Répondre chiffré').click();
    await settle(() => root.textContent?.includes('Réponse remise chiffrée') ?? false);
    const [answer] = await me.receive();

    expect(answer).toMatchObject({ from: friend, text: 'Bonjour Meeshy' });
    expect(root.querySelector('[role="status"]')?.getAttribute('aria-live')).toBe('polite');
    expect(porte.wire()).not.toContain('Bonjour l’ami');
    root.remove();
  });

  test('n’ouvre qu’une coquille quand on clique deux fois avant la fin de la première ouverture', async () => {
    const porte = createFakePorte({ accounts: { recette: { password: 'secret-de-test', userId: TEAM, role: 'MODERATOR' } } });
    const root = document.createElement('main');
    document.body.append(root);
    mountCoquillePage(root, { origin: 'https://gate.staging.test', fetch: porte.fetch, openBridge: async () => bridge });

    type(field(root, 'Identifiant de l’équipe'), 'recette');
    type(field(root, 'Mot de passe'), 'secret-de-test');
    type(field(root, 'Numéro WhatsApp simulé'), HANDLE);
    button(root, 'Ouvrir la coquille').click();
    button(root, 'Ouvrir la coquille').click();
    await settle(() => root.textContent?.includes(`Coquille ouverte : ${HANDLE}, appareil 1`) ?? false);

    expect(porte.publications()).toHaveLength(1);
    expect(button(root, 'Ouvrir la coquille').disabled).toBe(false);
    root.remove();
  });

  test('dit en clair pourquoi la connexion échoue', async () => {
    const porte = createFakePorte({ accounts: {} });
    const root = document.createElement('main');
    document.body.append(root);
    mountCoquillePage(root, { origin: 'https://gate.staging.test', fetch: porte.fetch, openBridge: async () => bridge });

    type(field(root, 'Identifiant de l’équipe'), 'inconnu');
    type(field(root, 'Mot de passe'), 'mdp-errone-41');
    type(field(root, 'Numéro WhatsApp simulé'), HANDLE);
    button(root, 'Ouvrir la coquille').click();
    await settle(() => root.querySelector('[role="status"]')?.textContent?.includes('Échec') ?? false);

    expect(root.querySelector('[role="status"]')?.textContent).toContain('connexion refusée (401 INVALID_CREDENTIALS)');
    expect(root.textContent).not.toContain('mdp-errone-41');
    root.remove();
  });
});
