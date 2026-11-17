import { E2EE_VAULT_DB_PREFIX, E2EE_VAULT_HELD_KEY } from '@/lib/e2ee/vault/vault-guard';

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
 * (#10015). D'ici là, il est ABSENT de tout navigateur qui tient un coffre,
 * par deux portes :
 *  - au DÉMARRAGE d'une page : `mayStart` sonde le navigateur
 *    (`e2eeVaultMayExist`) avant la création du Worker ;
 *  - dans la page : le coffre qui naît appelle `closeBeforeVault` AVANT sa
 *    première clé — le Worker déjà lancé s'arrête, et plus aucun ne démarre.
 *
 * Un coffre dont l'existence ne peut pas être exclue compte comme un coffre.
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

export type ThirdPartyRuntimeGate = {
  /** Le moteur tiers peut-il démarrer dans cette page ? Sondé une fois par page. */
  readonly mayStart: () => Promise<boolean>;
  /** Un moteur lancé s'inscrit avec ce qui l'arrête. */
  readonly register: (stop: () => void) => void;
  /** Le coffre qui naît : tout moteur lancé s'arrête, aucun ne démarre plus. */
  readonly closeBeforeVault: () => void;
};

export function createThirdPartyRuntimeGate({ vaultMayExist }: { readonly vaultMayExist: () => Promise<boolean> }): ThirdPartyRuntimeGate {
  const running = new Set<() => void>();
  let closed = false;
  let probe: Promise<boolean> | null = null;
  return {
    mayStart: async () => {
      if (closed) return false;
      probe ??= vaultMayExist().then((present) => !present);
      return (await probe) && !closed;
    },
    register: (stop) => {
      if (closed) {
        stop();
        return;
      }
      running.add(stop);
    },
    closeBeforeVault: () => {
      closed = true;
      running.forEach((stop) => stop());
      running.clear();
    },
  };
}

/** La porte de la page — le coffre (#17293) l'appelle AVANT sa première clé. */
export const thirdPartyRuntimeGate: ThirdPartyRuntimeGate = createThirdPartyRuntimeGate({
  vaultMayExist: () => e2eeVaultMayExist(globalThis),
});
