import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';

import { E2EE_VAULT_DB_PREFIX, E2EE_VAULT_HELD_KEY } from '@/lib/e2ee/vault/vault-guard';

import {
  createThirdPartyRuntimeGate,
  e2eeVaultMayExist,
  type RuntimeChannel,
  type RuntimeLockManager,
  type VaultPresenceHost,
} from './third-party-runtime-gate';

/**
 * **LE MOTEUR DE TRADUCTION TIERS NE DÉMARRE JAMAIS DANS UN NAVIGATEUR QUI
 * TIENT DES CLÉS CHIFFRÉES** (#18989, décision par défaut #18999).
 *
 * Le Worker de traduction importe transformers.js depuis jsDelivr, sans
 * intégrité possible, dans un Worker de MÊME origine : il ouvre l'IndexedDB
 * de l'origine. Mesuré dans Chromium (contre-analyse du 2026-11-17) : un tel
 * Worker relit une `CryptoKey` non extractible du coffre et DÉCHIFFRE ce
 * qu'elle scelle. Tant que le moteur n'est pas hébergé et vérifié par
 * condensat (#10015), il est ABSENT de tout navigateur qui tient un coffre —
 * et l'existence d'un coffre qui ne peut pas être exclue compte comme un coffre.
 */
const storage = (entries: Readonly<Record<string, string>>) => ({ getItem: (key: string) => entries[key] ?? null });
const databases = (names: readonly string[]) => ({ databases: () => Promise.resolve(names.map((name) => ({ name }))) });

describe('e2eeVaultMayExist — un coffre qui ne peut pas être exclu compte comme un coffre', () => {
  test('aucune base `meeshy-e2ee-*` et aucune marque : aucun coffre', async () => {
    const host: VaultPresenceHost = { localStorage: storage({}), indexedDB: databases(['meeshy-device', 'meeshy-push']) };

    expect(await e2eeVaultMayExist(host)).toBe(false);
  });

  test('une base de coffre, d’un compte quelconque : un coffre', async () => {
    const host: VaultPresenceHost = { localStorage: storage({}), indexedDB: databases(['meeshy-device', `${E2EE_VAULT_DB_PREFIX}64b000000000000000000001`]) };

    expect(await e2eeVaultMayExist(host)).toBe(true);
  });

  test('la marque que le coffre pose AVANT sa première clé suffit, même sans énumération des bases', async () => {
    expect(await e2eeVaultMayExist({ localStorage: storage({ [E2EE_VAULT_HELD_KEY]: '1' }) })).toBe(true);
    expect(await e2eeVaultMayExist({ localStorage: storage({ [E2EE_VAULT_HELD_KEY]: '1' }), indexedDB: databases([]) })).toBe(true);
  });

  test('un stockage qui refuse la lecture, ou une énumération qui échoue : le coffre n’est pas exclu', async () => {
    const throwing = { getItem: () => { throw new DOMException('refusé', 'SecurityError'); } };
    expect(await e2eeVaultMayExist({ localStorage: throwing, indexedDB: databases([]) })).toBe(true);
    expect(await e2eeVaultMayExist({ localStorage: storage({}), indexedDB: { databases: () => Promise.reject(new Error('refusé')) } })).toBe(true);
    expect(await e2eeVaultMayExist({ indexedDB: databases([]) })).toBe(true);
  });

  test('sans énumération des bases (navigateur ancien), la marque absente exclut le coffre — elle le précède toujours', async () => {
    expect(await e2eeVaultMayExist({ localStorage: storage({}) })).toBe(false);
  });
});

/**
 * Un `LockManager` partagé par plusieurs contextes de l'origine, fidèle à Web
 * Locks sur ce que la porte emploie : les demandes d'un nom se servent DANS
 * L'ORDRE, une part partagée s'ajoute aux parts partagées tenues, et une part
 * partagée demandée après une part exclusive en attente attend derrière elle.
 */
const originLocks = (): RuntimeLockManager => {
  type Waiter = { readonly mode: 'shared' | 'exclusive'; readonly run: () => void };
  const holders = new Map<string, { readonly mode: 'shared' | 'exclusive'; readonly count: number }>();
  const queues = new Map<string, Waiter[]>();
  const queueOf = (name: string): Waiter[] => {
    const queue = queues.get(name) ?? [];
    queues.set(name, queue);
    return queue;
  };
  const pump = (name: string) => {
    const queue = queueOf(name);
    for (;;) {
      const head = queue[0];
      const held = holders.get(name);
      if (head === undefined) return;
      if (held !== undefined && (held.mode === 'exclusive' || head.mode === 'exclusive')) return;
      queue.shift();
      holders.set(name, { mode: head.mode, count: (held?.count ?? 0) + 1 });
      head.run();
    }
  };
  const release = (name: string) => {
    const held = holders.get(name);
    if (held !== undefined && held.count > 1) holders.set(name, { mode: held.mode, count: held.count - 1 });
    else holders.delete(name);
    pump(name);
  };
  return {
    request: (name, { mode }, callback) =>
      new Promise((resolve, reject) => {
        const run = () =>
          void callback().then(
            (value) => {
              release(name);
              resolve(value);
            },
            (error: unknown) => {
              release(name);
              reject(error);
            },
          );
        queueOf(name).push({ mode, run });
        pump(name);
      }),
  };
};

/** Un `BroadcastChannel` : ce qu'un contexte poste arrive, plus tard, à tous les AUTRES. */
const originBus = () => {
  const listeners = new Set<{ readonly owner: symbol; readonly listener: (event: { readonly data: unknown }) => void }>();
  return (): RuntimeChannel => {
    const owner = Symbol('contexte');
    return {
      postMessage: (data) =>
        listeners.forEach((entry) => {
          if (entry.owner !== owner) setTimeout(() => entry.listener({ data }), 0);
        }),
      addEventListener: (_type, listener) => void listeners.add({ owner, listener }),
    };
  };
};

/** Une origine : la marque du coffre, le verrou et le canal que ses contextes partagent. */
const origin = () => {
  const marker = { held: false };
  const locks = originLocks();
  const channel = originBus();
  const context = () =>
    createThirdPartyRuntimeGate({
      vaultMayExist: () => Promise.resolve(marker.held),
      markVault: () => void (marker.held = true),
      locks,
      channel: channel(),
    });
  return { marker, locks, context };
};

/** Un moteur fictif : son lancement et son arrêt s'inscrivent au journal. */
const engine = (journal: string[], name: string) => () => {
  journal.push(`${name} : lancé`);
  return () => void journal.push(`${name} : arrêté`);
};

const tick = () => new Promise((resolve) => setTimeout(resolve, 5));

const rejectionOf = (attempt: Promise<unknown>): Promise<unknown> =>
  attempt.then(
    () => undefined,
    (error: unknown) => error,
  );

describe('createThirdPartyRuntimeGate — le moteur tiers ne vit dans aucun contexte d’une origine qui tient un coffre', () => {
  test('sans coffre, il démarre', async () => {
    const journal: string[] = [];

    expect(await origin().context().start(engine(journal, 'traduction'))).toBe(true);
    expect(journal).toEqual(['traduction : lancé']);
  });

  test('avec un coffre, il ne démarre pas', async () => {
    const { marker, context } = origin();
    marker.held = true;
    const journal: string[] = [];

    expect(await context().start(engine(journal, 'traduction'))).toBe(false);
    expect(journal).toEqual([]);
  });

  test('le coffre qui naît dans la page ARRÊTE le moteur déjà lancé, et plus aucun ne démarre', async () => {
    const gate = origin().context();
    const journal: string[] = [];
    await gate.start(engine(journal, 'traduction'));

    await gate.closeBeforeVault();

    expect(journal).toEqual(['traduction : lancé', 'traduction : arrêté']);
    expect(await gate.start(engine(journal, 'relance'))).toBe(false);
  });

  test('le coffre qui naît dans un AUTRE onglet arrête le moteur de celui-ci, et ne naît qu’une fois ce moteur arrêté', async () => {
    const { context } = origin();
    const translatingTab = context();
    const vaultTab = context();
    const journal: string[] = [];
    await translatingTab.start(engine(journal, 'onglet qui traduit'));

    await vaultTab.closeBeforeVault();
    journal.push('onglet du coffre : première clé');

    expect(journal).toEqual(['onglet qui traduit : lancé', 'onglet qui traduit : arrêté', 'onglet du coffre : première clé']);
    expect(await translatingTab.start(engine(journal, 'relance'))).toBe(false);
  });

  test('un onglet qui démarre pendant la naissance du coffre ne lance rien : la marque précède la part exclusive', async () => {
    const { marker, context } = origin();
    const vaultTab = context();
    const lateTab = context();
    const journal: string[] = [];

    const birth = vaultTab.closeBeforeVault();
    const late = lateTab.start(engine(journal, 'onglet tardif'));
    await birth;

    expect(marker.held).toBe(true);
    expect(await late).toBe(false);
    expect(journal).toEqual([]);
  });

  test('tant qu’un moteur d’un autre contexte ne s’est pas arrêté, le coffre ne naît pas', async () => {
    const { locks } = origin();
    const ports = { vaultMayExist: () => Promise.resolve(false), markVault: () => undefined, locks, channel: undefined };
    const deafTab = createThirdPartyRuntimeGate(ports);
    const vaultTab = createThirdPartyRuntimeGate(ports);
    await deafTab.start(engine([], 'onglet sourd'));
    let born = false;

    void vaultTab.closeBeforeVault().then(() => void (born = true));
    await tick();

    expect(born).toBe(false);
  });

  test('un moteur qui ne se lance pas, une sonde qui échoue : le moteur est absent, jamais une exception', async () => {
    const { locks } = origin();
    const launchFails = createThirdPartyRuntimeGate({ vaultMayExist: () => Promise.resolve(false), markVault: () => undefined, locks, channel: undefined });
    const probeFails = createThirdPartyRuntimeGate({ vaultMayExist: () => Promise.reject(new Error('refusé')), markVault: () => undefined, locks, channel: undefined });
    const refused = () => {
      throw new Error('Worker refusé');
    };

    expect(await launchFails.start(refused)).toBe(false);
    expect(await probeFails.start(engine([], 'traduction'))).toBe(false);
  });

  test('sans Web Locks, le moteur démarre sur la seule sonde, et aucun coffre ne peut naître', async () => {
    const gate = createThirdPartyRuntimeGate({ vaultMayExist: () => Promise.resolve(false), markVault: () => undefined, locks: undefined, channel: undefined });
    const journal: string[] = [];

    expect(await gate.start(engine(journal, 'traduction'))).toBe(true);
    expect(await rejectionOf(gate.closeBeforeVault())).toMatchObject({ reason: 'NO_WEB_LOCKS' });
    expect(journal).toEqual(['traduction : lancé', 'traduction : arrêté']);
  });

  test('une marque qui ne s’écrit pas empêche le coffre de naître', async () => {
    const gate = createThirdPartyRuntimeGate({
      vaultMayExist: () => Promise.resolve(false),
      markVault: () => {
        throw new DOMException('quota', 'QuotaExceededError');
      },
      locks: origin().locks,
      channel: undefined,
    });

    expect(await rejectionOf(gate.closeBeforeVault())).toMatchObject({ name: 'QuotaExceededError' });
  });
});

describe('runtime.ts — le Worker tiers ne se crée que par la porte', () => {
  const runtime = readFileSync(new URL('./runtime.ts', import.meta.url), 'utf8');

  test('le seul chemin qui crée le Worker passe par `thirdPartyRuntimeGate.start`', () => {
    const launcher = runtime.indexOf('function launchScheduler(');
    const worker = runtime.indexOf('new Worker(');
    const nextFunction = runtime.indexOf('\nexport function', launcher);

    expect(launcher).toBeGreaterThan(-1);
    expect(runtime.split('new Worker(').length - 1).toBe(1);
    expect(worker > launcher && worker < nextFunction).toBe(true);
    expect(runtime.split('launchScheduler(').length - 1).toBe(2);
    expect(runtime).toContain('thirdPartyRuntimeGate.start(() => launchScheduler(queryClient))');
  });
});
