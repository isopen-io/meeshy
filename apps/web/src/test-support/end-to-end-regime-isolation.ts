import { afterEach } from 'bun:test';

import { CLEAR_STORAGE_PREFIX, endToEndRegimeLedger, SEALED_STORAGE_PREFIX, SINCE_STORAGE_PREFIX } from '@/lib/end-to-end-regime-ledger';

const PREFIXES = [SEALED_STORAGE_PREFIX, SINCE_STORAGE_PREFIX, CLEAR_STORAGE_PREFIX] as const;

/**
 * LE REGISTRE DU BOUT EN BOUT NE TRAVERSE PAS LES TÉMOINS (#12949) — c'est un
 * singleton par compte, persistant : une conversation apprise e2ee par un
 * témoin (un avis d'activation rejoué, un fil e2ee monté) fermerait au clair
 * la même conversation d'un témoin suivant, selon l'ordre des fichiers (rouge
 * en CI seulement). Chaque témoin repart d'un registre vierge, mémoire ET
 * stockage — la liste scellée, les ères et la photographie des clairs.
 */
afterEach(() => {
  endToEndRegimeLedger.getState().reset();
  try {
    const keys = Array.from({ length: localStorage.length }, (_, index) => localStorage.key(index)).filter(
      (key): key is string => key !== null && PREFIXES.some((prefix) => key.startsWith(prefix)),
    );
    keys.forEach((key) => localStorage.removeItem(key));
  } catch {
    return;
  }
});
