/**
 * Les types du module voisin — voir `institutional-routes.d.mts` pour la
 * raison d'être de ce motif : trois runtimes distincts (Vite, bun, node)
 * consomment ce fichier, seul le premier lit du TypeScript.
 */
export declare function resolveDistDir(here: string, argv: readonly string[]): string;
