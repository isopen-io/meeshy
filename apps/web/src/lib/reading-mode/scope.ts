/**
 * LE SCOPE DU MAGASIN DE MODE DE LECTURE (#5650, F7) — dérivé du VIEWER,
 * miroir `scopeKey` iOS (`targets/focal-script.md:127-128`).
 *
 * `'local'` sans identité (visiteur anonyme, ou source `fixtures` où
 * `resolveViewer` ne rend jamais d'id nul en pratique mais le type le
 * permet) — la MÊME clé qu'avant ce lot, donc AUCUNE migration de données
 * persistées n'est nécessaire pour les visiteurs qui n'ont jamais eu de
 * session. `u_<id>` avec une identité : anti-fuite multi-comptes
 * (`store.test.ts:34` le prouve déjà pour deux scopes distincts).
 */
export function readingModeScopeOf(viewer: { readonly id: string | null }): string {
  return viewer.id === null ? 'local' : `u_${viewer.id}`;
}
