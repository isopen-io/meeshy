/**
 * Les types du module voisin — voir `scripts/lib/institutional-routes.d.mts`
 * pour la raison d'être de ce motif : trois runtimes distincts (Vite, bun,
 * node) consomment ce fichier, seul le premier lit du TypeScript.
 */
export type ThemeEngineViolation = Readonly<{
  readonly line: number;
  readonly kind: 'system-query' | 'scheme-class' | 'theme-attribute';
  readonly match: string;
}>;

export type ThemeEngineReport = Readonly<{
  readonly total: number;
  readonly files: readonly Readonly<{ readonly path: string; readonly violations: readonly ThemeEngineViolation[] }>[];
  readonly missingEngineFiles: readonly string[];
}>;

export declare const ENGINE_FILES: readonly string[];

export declare function isInScope(path: string): boolean;

export declare function scanSource(text: string): readonly ThemeEngineViolation[];

export declare function auditSources(
  sources: readonly Readonly<{ readonly path: string; readonly text: string }>[],
): ThemeEngineReport;
