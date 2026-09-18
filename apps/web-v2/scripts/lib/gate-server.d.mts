/**
 * Les types du module voisin — même motif que `browser.d.mts` et
 * `resolve-dist-dir.d.mts` : trois runtimes consomment le `.mjs` (Vite, bun,
 * node), seul `tsc` lit ces déclarations.
 */
import type { Server } from 'node:http';

export type DistServer = {
  readonly server: Server;
  /** L'origine à donner à `page.goto` — le port est choisi libre. */
  readonly base: string;
  readonly close: () => void;
};

/** Les fichiers à tenter pour un chemin. Un chemin à extension n'en a qu'UN. */
export declare function distCandidates(pathname: string): readonly string[];

export declare function startDistServer(
  dist: string,
  io?: {
    readonly readFile?: (path: string) => Promise<Buffer | string>;
    readonly stat?: (path: string) => Promise<{ isFile(): boolean }>;
  },
): Promise<DistServer>;
