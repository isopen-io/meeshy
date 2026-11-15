/**
 * Ce que la coque Capacitor pose sur `window.Capacitor` AVANT le premier
 * script (`native-bridge.js`, `JSExport`) : la liste des plugins natifs
 * enregistrés et l'appel brut. Lu tel quel — importer `@capacitor/core` pour
 * deux champs pèserait sur le bundle web qui n'en a pas l'usage.
 */
export type CoqueNative = {
  readonly PluginHeaders?: ReadonlyArray<{ readonly name: string; readonly methods?: ReadonlyArray<{ readonly name: string }> }>;
  readonly nativePromise?: (plugin: string, methode: string, options: object) => Promise<unknown>;
  /** `android` ou `ios` dans une coque, `web` ailleurs. */
  readonly getPlatform?: () => string;
  /** L'écoute d'un événement de plugin (`native-bridge.js`, `initEvents`). */
  readonly addListener?: (
    plugin: string,
    evenement: string,
    rappel: (donnees: unknown) => void,
  ) => { readonly remove: () => Promise<void> };
};

export function coqueCourante(): CoqueNative | undefined {
  return (globalThis as { Capacitor?: CoqueNative }).Capacitor;
}

/**
 * L'appel natif, ou `null` quand l'hôte n'est pas une coque qui déclare ce
 * plugin — un navigateur, ou une coque construite avant lui.
 */
export function appelNatif(
  coque: CoqueNative | undefined,
  plugin: string,
): ((methode: string, options: object) => Promise<unknown>) | null {
  const nativePromise = coque?.nativePromise;
  const declare = coque?.PluginHeaders?.some((header) => header.name === plugin) === true;
  if (!declare || typeof nativePromise !== 'function') return null;
  return (methode, options) => nativePromise(plugin, methode, options);
}

/**
 * L'appel d'UNE méthode, ou `null` quand la coque ne la déclare pas : une
 * coque construite avant la méthode garde le plugin mais pas elle, et
 * l'appeler rejetterait au premier geste (#7863).
 */
export function appelNatifMethode(
  coque: CoqueNative | undefined,
  plugin: string,
  methode: string,
): ((options: object) => Promise<unknown>) | null {
  const appel = appelNatif(coque, plugin);
  const header = coque?.PluginHeaders?.find((entete) => entete.name === plugin);
  const declaree = header?.methods?.some((m) => m.name === methode) === true;
  if (appel === null || !declaree) return null;
  return (options) => appel(methode, options);
}

/**
 * La feuille Android fermée sans choix (#7822) : le pont `MeeshyShare`
 * rejette avec le code `CANCELED`. Traduit en `AbortError`, il prend le
 * chemin d'une annulation de `navigator.share` — rien n'est compté ni annoncé.
 */
export function annulationDuPont(erreur: unknown): unknown {
  const code = (erreur as { readonly code?: unknown } | null)?.code;
  return code === 'CANCELED' ? new DOMException('Partage annulé', 'AbortError') : erreur;
}
