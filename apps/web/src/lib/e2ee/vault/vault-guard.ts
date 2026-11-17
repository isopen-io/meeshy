/**
 * **LA GARDE DU COFFRE E2EE DU NAVIGATEUR : UN VERROU, UNE VERSION** (#18990).
 *
 * Le pont libsignal est SANS ÉTAT (`libsignal-bridge.ts`) : chaque opération
 * part d'un instantané de session rangé et rend le suivant. Deux contextes qui
 * partent du même instantané — deux onglets, un onglet et le service worker,
 * un Worker de pile — réutilisent la clé de message et l'IV et perdent le
 * second message, ou font bifurquer le ratchet jusqu'à rendre la réponse du
 * pair indéchiffrable (audit E2EE web du 2026-11-17, WEB-02 : 14 états sur 14).
 * Toute opération qui fait AVANCER un ratchet (ouvrir, sceller, ouvrir une
 * session, consommer une pré-clé) se fait donc sous le verrou Web Locks du
 * compte, de la relecture de l'état à l'écriture qui le range.
 *
 * Propre au web (contre-analyse, WEBX-07) : le service worker est en `prompt`,
 * sans `skipWaiting` — après un déploiement, un onglet exécute l'ANCIEN bundle
 * pendant qu'un autre exécute le nouveau, sur la MÊME IndexedDB. D'où trois
 * règles, que ce module porte AVANT que le coffre n'existe (#17293) :
 *
 *  - le NOM du verrou (`meeshy-e2ee:<userId>`) et celui de la base
 *    (`meeshy-e2ee-<userId>`) sont un CONTRAT entre versions du code : les
 *    changer, c'est faire perdre à deux onglets tout verrou commun ;
 *  - la version IndexedDB (`E2EE_VAULT_DB_VERSION`) MONTE à chaque changement
 *    de forme d'un enregistrement — jamais une forme nouvelle sous une version
 *    ancienne ;
 *  - chaque connexion se FERME sur `versionchange` et suspend l'e2ee de son
 *    onglet (`onSuperseded` : bandeau « rechargez ») ; un code plus ANCIEN que
 *    la base la refuse (`NEWER_VAULT`) sans jamais la réécrire.
 *
 * Sans Web Locks ni IndexedDB, le navigateur REFUSE de tenir des clés : une
 * exclusion de façade serait pire que pas d'exclusion, elle aurait l'air de
 * protéger. Le même verrou se prend dans la page, le service worker et un
 * Worker de pile (`navigator.locks` existe dans les trois).
 */

export const E2EE_VAULT_LOCK_PREFIX = 'meeshy-e2ee:';
export const E2EE_VAULT_DB_PREFIX = 'meeshy-e2ee-';

/**
 * LA FORME DU COFFRE. Elle MONTE à chaque changement de forme d'un magasin ou
 * d'un enregistrement : un onglet resté sur l'ancien bundle voit alors sa
 * connexion fermée (`versionchange`) au lieu de lire ce qu'il ne comprend pas.
 */
export const E2EE_VAULT_DB_VERSION = 1;

export const e2eeVaultLockName = (userId: string): string => `${E2EE_VAULT_LOCK_PREFIX}${userId}`;
export const e2eeVaultDatabaseName = (userId: string): string => `${E2EE_VAULT_DB_PREFIX}${userId}`;

export type E2EEVaultUnavailableReason = 'NO_WEB_LOCKS' | 'NO_INDEXED_DB' | 'NEWER_VAULT';

/** Le navigateur ne peut pas tenir de clés chiffrées ici — la raison le dit, pour l'interface. */
export class E2EEVaultUnavailable extends Error {
  constructor(readonly reason: E2EEVaultUnavailableReason) {
    super(`coffre E2EE indisponible : ${reason}`);
    this.name = 'E2EEVaultUnavailable';
  }
}

/** La part de `LockManager` (Web Locks) que le coffre emploie : un verrou EXCLUSIF par nom. */
export type VaultLockManager = {
  readonly request: <T>(name: string, options: { readonly mode: 'exclusive' }, callback: () => Promise<T>) => Promise<T>;
};

const isLockManager = (candidate: unknown): candidate is VaultLockManager =>
  typeof candidate === 'object' && candidate !== null && typeof (candidate as { readonly request?: unknown }).request === 'function';

/** `navigator.locks`, ou le refus de tenir des clés. */
export function vaultLockManager(host: { readonly locks?: unknown }): VaultLockManager {
  if (!isLockManager(host.locks)) throw new E2EEVaultUnavailable('NO_WEB_LOCKS');
  return host.locks;
}

/** Une opération qui fait avancer un ratchet du compte, sous SON verrou exclusif. */
export function withE2EEVaultLock<T>(locks: VaultLockManager, userId: string, operate: () => Promise<T>): Promise<T> {
  return locks.request(e2eeVaultLockName(userId), { mode: 'exclusive' }, operate);
}

/** Une connexion ouverte : la seule chose que la garde en fait, c'est la fermer quand une version plus récente arrive. */
export type VaultDatabaseConnection = {
  onversionchange: (() => void) | null;
  readonly close: () => void;
};

type VaultOpenRequest<Connection extends VaultDatabaseConnection> = {
  readonly result: Connection | null;
  readonly error: DOMException | null;
  onsuccess: (() => void) | null;
  onerror: (() => void) | null;
  onupgradeneeded: ((event: { readonly oldVersion: number; readonly newVersion: number | null }) => void) | null;
  onblocked: (() => void) | null;
};

/** La part d'`IDBFactory` que la garde emploie — `indexedDB` en production, un double en témoin. */
export type VaultDatabaseFactory<Connection extends VaultDatabaseConnection = VaultDatabaseConnection> = {
  readonly open: (name: string, version: number) => VaultOpenRequest<Connection>;
};

export type OpenE2EEVaultOptions<Connection extends VaultDatabaseConnection> = {
  readonly factory: VaultDatabaseFactory<Connection> | undefined;
  readonly userId: string;
  /** Crée ou migre la forme : appelée UNE fois par montée de version, dans la transaction de mise à niveau. */
  readonly upgrade: (connection: Connection, change: { readonly oldVersion: number; readonly newVersion: number }) => void;
  /** Une version plus récente du code s'ouvre : la connexion est déjà fermée, l'onglet suspend son e2ee. */
  readonly onSuperseded: () => void;
};

export function openE2EEVaultDatabase<Connection extends VaultDatabaseConnection>({
  factory,
  userId,
  upgrade,
  onSuperseded,
}: OpenE2EEVaultOptions<Connection>): Promise<Connection> {
  if (factory === undefined) return Promise.reject(new E2EEVaultUnavailable('NO_INDEXED_DB'));
  return new Promise((resolve, reject) => {
    const request = factory.open(e2eeVaultDatabaseName(userId), E2EE_VAULT_DB_VERSION);
    request.onupgradeneeded = ({ oldVersion }) => {
      if (request.result !== null) upgrade(request.result, { oldVersion, newVersion: E2EE_VAULT_DB_VERSION });
    };
    request.onerror = () => reject(request.error?.name === 'VersionError' ? new E2EEVaultUnavailable('NEWER_VAULT') : (request.error ?? new E2EEVaultUnavailable('NO_INDEXED_DB')));
    request.onsuccess = () => {
      const connection = request.result;
      if (connection === null) {
        reject(new E2EEVaultUnavailable('NO_INDEXED_DB'));
        return;
      }
      connection.onversionchange = () => {
        connection.close();
        onSuperseded();
      };
      resolve(connection);
    };
  });
}
