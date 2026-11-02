/**
 * **LES ADRESSES DES ILLUSTRATIONS** (#12683) — les `.webp` de
 * `packages/shared/design/call-capture-frames/assets/call-frames/`, les mêmes octets
 * qu'iOS embarque, que Vite emporte comme fichiers empreints. Module à part, chargé
 * à la demande par `deferredFrameImages` : sa table ne pèse pas sur l'atelier.
 */

const ASSET_PREFIX = 'assets/call-frames/';

/** `assets/call-frames/<fichier>.webp` → l'adresse servie ; `{}` hors de Vite (les témoins, bun). */
export function frameAssetUrls(): Readonly<Record<string, string>> {
  try {
    return assetSources(import.meta.glob('../../../../../../packages/shared/design/call-capture-frames/assets/call-frames/*.webp', { eager: true, query: '?url', import: 'default' }));
  } catch {
    return {};
  }
}

/** Les chemins du pack depuis les clés d'un glob (le chemin relatif du fichier), les valeurs qui ne sont pas des adresses écartées. */
export function assetSources(globbed: Readonly<Record<string, unknown>>): Readonly<Record<string, string>> {
  return Object.fromEntries(
    Object.entries(globbed).flatMap(([path, url]) => {
      const name = path.slice(path.lastIndexOf('/') + 1);
      return typeof url === 'string' && name.length > 0 ? [[`${ASSET_PREFIX}${name}`, url]] : [];
    }),
  );
}
