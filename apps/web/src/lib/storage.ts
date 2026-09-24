/**
 * `localStorage` SÛR — seul point d'accès au global, résolu paresseusement
 * pour qu'un contexte sans DOM (bun test, rendu institutionnel préchauffé)
 * ne fasse jamais échouer l'IMPORT du module qui l'appelle : seule la
 * création SANS storage explicite le sollicite, et elle retombe en mémoire
 * si l'accès échoue (navigation privée stricte, `localStorage` absent).
 *
 * Extrait de `api/session.ts` (#5816, E3) : c'était sa seule fonction privée
 * jusqu'ici, et `welcome.ts` en a besoin pour la MÊME raison — persister un
 * drapeau simple, sans réseau. Une seconde copie de cette même logique de
 * repli aurait été la « jumelle divergente » que le dépôt interdit.
 */

export type SafeStorage = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
};

export function safeLocalStorage(): SafeStorage {
  try {
    const probe = '__meeshy_storage_probe__';
    globalThis.localStorage.setItem(probe, '1');
    globalThis.localStorage.removeItem(probe);
    return globalThis.localStorage;
  } catch {
    const memory = new Map<string, string>();
    return {
      getItem: (key) => memory.get(key) ?? null,
      setItem: (key, value) => {
        memory.set(key, value);
      },
      removeItem: (key) => {
        memory.delete(key);
      },
    };
  }
}
