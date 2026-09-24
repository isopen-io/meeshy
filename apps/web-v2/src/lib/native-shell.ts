/**
 * Ce que la coque Capacitor pose sur `window.Capacitor` AVANT le premier
 * script (`native-bridge.js`, `JSExport`) : la liste des plugins natifs
 * enregistrés et l'appel brut. Lu tel quel — importer `@capacitor/core` pour
 * deux champs pèserait sur le bundle web qui n'en a pas l'usage.
 */
export type CoqueNative = {
  readonly PluginHeaders?: ReadonlyArray<{ readonly name: string }>;
  readonly nativePromise?: (plugin: string, methode: string, options: object) => Promise<unknown>;
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
