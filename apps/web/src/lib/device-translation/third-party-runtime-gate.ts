import { E2EE_VAULT_DB_PREFIX, E2EE_VAULT_HELD_KEY, E2EEVaultUnavailable } from '@/lib/e2ee/vault/vault-guard';

/**
 * **LE MOTEUR DE TRADUCTION TIERS NE VIT JAMAIS À CÔTÉ D'UN COFFRE CHIFFRÉ**
 * (#18989, décision par défaut #18999).
 *
 * Le Worker de traduction (`device-translation-worker.ts`) importe
 * transformers.js et onnxruntime depuis jsDelivr : un `import()` n'accepte
 * aucune intégrité, et le Worker est de MÊME origine — il ouvre l'IndexedDB
 * et le Cache Storage de l'origine. Mesuré dans Chromium (contre-analyse du
 * 2026-11-17, WEB-08) : un tel Worker relit une `CryptoKey` non extractible du
 * coffre et DÉCHIFFRE l'enregistrement qu'elle scelle. Le moteur exige en
 * outre `eval` (embind d'onnxruntime) : aucune politique ne le borne utilement.
 *
 * La cible est un moteur hébergé chez Meeshy et vérifié par condensat
 * (#10015). D'ici là, il est ABSENT de tout navigateur qui tient un coffre —
 * de TOUS ses contextes, pas seulement de la page où le coffre naît : le
 * Worker d'un autre onglet, lancé avant le coffre, lirait le coffre aussi bien.
 * L'exclusion se tient par un verrou Web Locks de l'ORIGINE
 * (`THIRD_PARTY_RUNTIME_LOCK`, au nom figé) :
 *  - un moteur ne démarre que sous la part PARTAGÉE du verrou, qu'il garde
 *    tant qu'il vit, et seulement si la présence d'un coffre, relue SOUS cette
 *    part, est exclue (`e2eeVaultMayExist`) ;
 *  - le coffre qui naît appelle `closeBeforeVault` AVANT sa première clé :
 *    la marque est posée, tout moteur de la page s'arrête, ceux des autres
 *    contextes sont priés de s'arrêter (`THIRD_PARTY_RUNTIME_CHANNEL`), et la
 *    promesse ne se résout qu'à l'obtention de la part EXCLUSIVE — quand plus
 *    aucun moteur ne vit dans l'origine. Une part partagée demandée ensuite
 *    relit la marque et ne lance rien.
 *
 * Un contexte qui n'entend pas la prière garde sa part : le coffre attend, il
 * ne naît pas à côté d'un moteur. Un coffre dont l'existence ne peut pas être
 * exclue compte comme un coffre ; et la marque ne s'efface qu'APRÈS la base.
 */

export type VaultPresenceHost = {
  readonly localStorage?: { readonly getItem: (key: string) => string | null };
  readonly indexedDB?: { readonly databases?: () => Promise<readonly { readonly name?: string }[]> };
};

/**
 * La marque (`E2EE_VAULT_HELD_KEY`) précède toujours la base : son absence
 * exclut un coffre là où les bases ne s'énumèrent pas. Un stockage qui refuse
 * la lecture, ou une énumération qui échoue, ne l'exclut pas.
 */
export async function e2eeVaultMayExist(host: VaultPresenceHost): Promise<boolean> {
  try {
    if (host.localStorage === undefined || host.localStorage.getItem(E2EE_VAULT_HELD_KEY) !== null) return true;
  } catch {
    return true;
  }
  const factory = host.indexedDB;
  if (factory?.databases === undefined) return false;
  try {
    const databases = await factory.databases();
    return databases.some(({ name }) => name?.startsWith(E2EE_VAULT_DB_PREFIX) === true);
  } catch {
    return true;
  }
}

/** Le verrou de l'ORIGINE, pas d'un compte : le moteur tiers lit l'IndexedDB de tous les comptes. Nom FIGÉ entre deux versions du code. */
export const THIRD_PARTY_RUNTIME_LOCK = 'meeshy-third-party-runtime';
/** Le canal où le coffre qui naît prie tout contexte de l'origine d'arrêter son moteur. */
export const THIRD_PARTY_RUNTIME_CHANNEL = 'meeshy-third-party-runtime';
const CLOSE_BEFORE_VAULT = 'close-before-vault';

/** La part de `LockManager` (Web Locks) que la porte emploie : une part partagée ou exclusive d'un nom. */
export type RuntimeLockManager = {
  readonly request: <T>(name: string, options: { readonly mode: 'shared' | 'exclusive' }, callback: () => Promise<T>) => Promise<T>;
};

/** La part de `BroadcastChannel` que la porte emploie. */
export type RuntimeChannel = {
  readonly postMessage: (message: unknown) => void;
  readonly addEventListener: (type: 'message', listener: (event: { readonly data: unknown }) => void) => void;
};

export type ThirdPartyRuntimeGatePorts = {
  readonly vaultMayExist: () => Promise<boolean>;
  /** Pose la marque `E2EE_VAULT_HELD_KEY` ; lève si elle ne s'écrit pas. */
  readonly markVault: () => void;
  readonly locks: RuntimeLockManager | undefined;
  readonly channel: RuntimeChannel | undefined;
};

export type ThirdPartyRuntimeGate = {
  /**
   * Lance le moteur si aucun coffre ne vit dans l'origine : `launch` le crée
   * et rend ce qui l'arrête. Rend `true` si le moteur tourne ; jamais une
   * exception — un moteur qui ne se lance pas, ou une sonde qui échoue, le
   * laisse absent.
   */
  readonly start: (launch: () => () => void) => Promise<boolean>;
  /**
   * Le coffre qui naît, AVANT sa première clé : marque posée, plus aucun
   * moteur dans l'origine. Rejette sans Web Locks (`NO_WEB_LOCKS`) ou si la
   * marque ne s'écrit pas : le coffre ne naît pas.
   */
  readonly closeBeforeVault: () => Promise<void>;
};

export function createThirdPartyRuntimeGate({ vaultMayExist, markVault, locks, channel }: ThirdPartyRuntimeGatePorts): ThirdPartyRuntimeGate {
  const running = new Set<() => void>();
  let closed = false;
  const close = () => {
    closed = true;
    running.forEach((halt) => halt());
    running.clear();
  };
  channel?.addEventListener('message', ({ data }) => {
    if (data === CLOSE_BEFORE_VAULT) close();
  });

  /**
   * Sonde, puis lance : rend l'arrêt À VENIR du moteur, ou `null` s'il n'a pas
   * démarré. L'arrêt voyage dans un objet : une promesse rendue telle quelle
   * par une fonction `async` serait ATTENDUE, et le démarrage ne se dirait
   * qu'à l'arrêt.
   */
  const runUnlessVault = async (launch: () => () => void): Promise<{ readonly stopped: Promise<void> } | null> => {
    if (closed) return null;
    const vault = await vaultMayExist();
    if (vault || closed) return null;
    const stop = launch();
    const stopped = new Promise<void>((done) => {
      running.add(() => {
        stop();
        done();
      });
    });
    return { stopped };
  };

  const startUnderSharedLock = (lockManager: RuntimeLockManager, launch: () => () => void) =>
    new Promise<boolean>((resolve, reject) => {
      lockManager
        .request(THIRD_PARTY_RUNTIME_LOCK, { mode: 'shared' }, async () => {
          const alive = await runUnlessVault(launch);
          resolve(alive !== null);
          await alive?.stopped;
        })
        .catch(reject);
    });

  return {
    start: async (launch) => {
      try {
        if (locks === undefined) return (await runUnlessVault(launch)) !== null;
        return await startUnderSharedLock(locks, launch);
      } catch {
        return false;
      }
    },
    closeBeforeVault: async () => {
      close();
      if (locks === undefined) throw new E2EEVaultUnavailable('NO_WEB_LOCKS');
      markVault();
      channel?.postMessage(CLOSE_BEFORE_VAULT);
      await locks.request(THIRD_PARTY_RUNTIME_LOCK, { mode: 'exclusive' }, () => Promise.resolve());
    },
  };
}

const isRuntimeLockManager = (candidate: unknown): candidate is RuntimeLockManager =>
  typeof candidate === 'object' && candidate !== null && typeof (candidate as { readonly request?: unknown }).request === 'function';

const originLocks = (): RuntimeLockManager | undefined => {
  const candidate = (globalThis.navigator as { readonly locks?: unknown } | undefined)?.locks;
  return isRuntimeLockManager(candidate) ? candidate : undefined;
};

const originChannel = (): RuntimeChannel | undefined =>
  typeof BroadcastChannel === 'function' ? new BroadcastChannel(THIRD_PARTY_RUNTIME_CHANNEL) : undefined;

/** La porte de la page — le coffre (#17293) l'appelle AVANT sa première clé. */
export const thirdPartyRuntimeGate: ThirdPartyRuntimeGate = createThirdPartyRuntimeGate({
  vaultMayExist: () => e2eeVaultMayExist(globalThis),
  markVault: () => globalThis.localStorage.setItem(E2EE_VAULT_HELD_KEY, '1'),
  locks: originLocks(),
  channel: originChannel(),
});
