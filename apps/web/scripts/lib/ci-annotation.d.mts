/**
 * Les types du module voisin — même motif que `await-fact.d.mts` : node lit le
 * `.mjs` pour les gates, bun pour les témoins, seul `tsc` lit ces déclarations.
 */

export declare const ciErrorAnnotation: (gate: string, message: string) => string;

export declare function reportFailures(options: {
  readonly gate: string;
  readonly failures: readonly string[];
  readonly bullet: string;
  readonly env?: Readonly<Record<string, string | undefined>>;
  readonly error?: (line: string) => void;
  readonly log?: (line: string) => void;
}): void;
