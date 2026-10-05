import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import type { ApiResult } from '@/lib/api/http';
import type { Activation, MyActivation } from '@/lib/api/activation';
import { localDay } from '@/lib/activation/invite';
import { loadInterfaceCatalog } from '@/lib/i18n-catalog';
import { buttonNamed, createActMounter } from '@/test-support/act-mount';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { ActivationInviteHost } from './activation-invite-host';

/**
 * **L'OUVERTURE DE L'APP DÉCIDE UNE FOIS** (#8239) — la phase servie ouvre la
 * modal en `invite` seulement ; `quiet`, `done` (même sans numéro), `blocked`
 * et une passerelle muette n'ouvrent rien. Une fois montrée, elle ne revient
 * pas avant demain sur cet appareil — et, montrée aujourd'hui, l'app ne relit
 * même pas l'état.
 */
const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };

beforeAll(async () => {
  ensureHappyDomRegistered();
  globals.IS_REACT_ACT_ENVIRONMENT = true;
  await loadInterfaceCatalog('fr');
});

afterAll(async () => {
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
});

const mounter = createActMounter();
afterEach(() => mounter.unmountAll());

const NOW = Date.UTC(2026, 8, 27, 12, 0, 0);

function memoryStorage(initial: Readonly<Record<string, string>> = {}) {
  const map = new Map<string, string>(Object.entries(initial));
  return {
    map,
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => void map.set(key, value),
    removeItem: (key: string) => void map.delete(key),
  };
}

async function monter(activation: Activation | null, storage = memoryStorage()) {
  const loads: string[] = [];
  const load = async (): Promise<ApiResult<MyActivation>> => {
    loads.push('me');
    return { ok: true, data: { activation, email: 'amina@example.test' } };
  };
  const host = await mounter.mount(<ActivationInviteHost load={load} storage={storage} now={() => NOW} language="fr" />);
  return { host, loads, storage };
}

const invite = (missing: Activation['missing']): Activation => ({ phase: 'invite', deadline: new Date(NOW + 5 * 86_400_000).toISOString(), missing });

describe('la phase décide', () => {
  test('invite ⇒ la modal s’ouvre, et le jour est retenu', async () => {
    const { host, storage } = await monter(invite(['email', 'phone']));
    expect(host.querySelector('dialog[data-activation-invite]')).not.toBeNull();
    expect([...storage.map.values()]).toContain(localDay(NOW));
  });

  test('quiet, blocked, done sans numéro, champ absent ⇒ rien', async () => {
    for (const activation of [
      { phase: 'quiet', deadline: null, missing: ['email'] },
      { phase: 'blocked', deadline: null, missing: ['email'] },
      { phase: 'done', deadline: null, missing: ['phone'] },
      null,
    ] as const) {
      const { host, storage } = await monter(activation === null ? null : { ...activation, missing: [...activation.missing] });
      expect(host.querySelector('dialog[data-activation-invite]')).toBeNull();
      expect(storage.map.size).toBe(0);
    }
  });
});

describe('une fois par jour et par appareil', () => {
  test('déjà montrée aujourd’hui ⇒ ni lecture ni modal', async () => {
    const storage = memoryStorage({ 'meeshy.activation-invite.shown-on': localDay(NOW) });
    const { host, loads } = await monter(invite(['email']), storage);
    expect(loads).toEqual([]);
    expect(host.querySelector('dialog[data-activation-invite]')).toBeNull();
  });

  test('« Plus tard » ferme la modal', async () => {
    const { host } = await monter(invite(['phone']));
    await mounter.click(buttonNamed(host, 'Plus tard'));
    expect(host.querySelector('dialog[data-activation-invite]')).toBeNull();
  });
});
