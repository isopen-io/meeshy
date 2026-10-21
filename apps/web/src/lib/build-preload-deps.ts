/**
 * UNE DÉPENDANCE DÉJÀ CHARGÉE NE SE LISTE PAS (#10974).
 *
 * Chaque `import()` d'un chunk porte la liste des fichiers à précharger avec
 * lui (`__vite__mapDeps([…])`). Vite y range TOUTE la fermeture statique de
 * l'écran — y compris `core`, `session`, `router`… que le chunk HÔTE importe
 * déjà statiquement, donc chargés avant qu'il ne s'exécute. Dans l'entrée,
 * ces indices se répétaient à chacune des ~150 routes (les listes y pèsent
 * ~15 Ko gzip sur 42), et chaque petit chunk partagé neuf en rajoutait à
 * toutes. Mesuré : première peinture 92,13 → 91,05 Ko.
 *
 * Le préchargeur les sautait déjà à l'exécution (un `<link rel=modulepreload>`
 * existant n'est pas reposé) : les retirer ne change rien au réseau, seulement
 * au poids. Le CSS n'est jamais touché — Vite ne passe ici que le JS.
 */
type BundleChunk = { readonly type: string; readonly imports?: readonly string[] };
type Bundle = Readonly<Record<string, BundleChunk>>;
type Context = { readonly hostId: string; readonly hostType: 'html' | 'js' };

const staticClosure = (bundle: Bundle, host: string): ReadonlySet<string> => {
  const seen = new Set<string>();
  const visit = (file: string): void => {
    if (seen.has(file)) return;
    seen.add(file);
    const chunk = bundle[file];
    if (chunk?.type === 'chunk') (chunk.imports ?? []).forEach(visit);
  };
  visit(host);
  return seen;
};

export const loadedPreloadDeps = () => {
  const state: { bundle: Bundle | null; closures: Map<string, ReadonlySet<string>> } = { bundle: null, closures: new Map() };
  const closureOf = (bundle: Bundle, host: string): ReadonlySet<string> => {
    const known = state.closures.get(host);
    if (known) return known;
    const computed = staticClosure(bundle, host);
    state.closures.set(host, computed);
    return computed;
  };
  return {
    capture: (bundle: Bundle): void => {
      state.bundle = bundle;
      state.closures = new Map();
    },
    resolveDependencies: (_file: string, deps: string[], { hostId, hostType }: Context): string[] => {
      const bundle = state.bundle;
      if (bundle === null || hostType !== 'js') return deps;
      const loaded = closureOf(bundle, hostId);
      return deps.filter((dep) => !loaded.has(dep));
    },
  };
};
