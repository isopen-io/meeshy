/**
 * Les types du module voisin — qui reste du JavaScript pour la même raison que
 * `institutional-routes.mjs` : il est lu par node (`route-inventory.mjs`) ET
 * par bun (le témoin `src/routes/route-inventory.test.ts`), et le premier ne
 * sait pas lire du TypeScript. Un `.d.mts` posé à côté donne le typage sans
 * imposer une étape de compilation.
 */
export declare const normalizePattern: (pattern: string) => string;
export declare function screenRoutes(source?: string): readonly string[];
export declare const institutionalRoutes: () => readonly string[];
export declare function v31Routes(): readonly { readonly url: string; readonly kind: 'écran' | 'document' }[];
