/**
 * LES DESSINS DU JEU HORS DU DOCUMENT (#9382) — les composants de
 * `components/game/` peignent avec des jetons (`var(--game-gold-0)`, définis
 * dans `styles/game.css`). Une image SVG chargée dans un `<img>` ou dessinée
 * sur un `canvas` ne voit pas les variables de la page : pour peindre le MÊME
 * emblème, Mee et Meo sur l'image finale, on remplace chaque variable par sa
 * valeur lue sur la racine du document.
 *
 * Une variable que la racine ne définit pas et qui n'a pas de repli est
 * NOMMÉE dans le rapport (`unresolved`) : un jeton oublié se voit au lieu de
 * peindre en noir sans rien dire. Le balisage garde alors `currentColor`.
 */

const VAR = /var\(\s*(--[\w-]+)\s*(?:,\s*([^)]*?))?\s*\)/g;

export type VarResolution = { readonly markup: string; readonly unresolved: readonly string[] };

export function resolveCssVars(markup: string, read: (name: string) => string): VarResolution {
  const unresolved: string[] = [];
  const resolved = markup.replace(VAR, (_match, name: string, fallback: string | undefined) => {
    const value = read(name).trim();
    if (value !== '') return value;
    if (fallback !== undefined && fallback.trim() !== '') return fallback.trim();
    if (!unresolved.includes(name)) unresolved.push(name);
    return 'currentColor';
  });
  return { markup: resolved, unresolved };
}

/** Un lecteur de jetons sur la racine du document (`:root`), valeur calculée et rognée. */
export function rootVarReader(env: {
  readonly getComputedStyle: (root: Element) => { getPropertyValue: (name: string) => string };
  readonly root: Element;
}): (name: string) => string {
  const style = env.getComputedStyle(env.root);
  return (name) => style.getPropertyValue(name).trim();
}
