/**
 * Les types du module voisin — voir `institutional-routes.d.mts` pour la
 * raison d'être de ce motif : les gates qui l'importent sont du JavaScript lu
 * par node, son témoin est du TypeScript lu par bun et par `tsc`.
 */
export declare function isEntryPoint(
  options: Readonly<{ readonly moduleUrl: string; readonly invokedPath: string | undefined }>,
): boolean;
