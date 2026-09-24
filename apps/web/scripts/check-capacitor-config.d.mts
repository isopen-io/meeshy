/**
 * Les types du module voisin — voir `scripts/lib/institutional-routes.d.mts`
 * pour la raison d'être de ce motif : trois runtimes distincts (Vite, bun,
 * node) consomment ce fichier, seul le premier lit du TypeScript.
 */
export type CapConfigReplayTarget = 'android' | 'ios';

export type CapConfigReplayResult = Readonly<{
  readonly status: number | null;
  readonly stdout: string;
  readonly stderr: string;
}>;

export declare function replayStartPath(target: CapConfigReplayTarget): CapConfigReplayResult;

export declare function judgeStartPathReplay(
  target: CapConfigReplayTarget,
  result: CapConfigReplayResult,
): readonly string[];

export declare function auditHookDeclaration(
  packageJson: Readonly<{ readonly scripts?: Readonly<Record<string, string>> }>,
  capConfig: Readonly<{ readonly ios?: Readonly<{ readonly webDir?: string }> }> | undefined,
): readonly string[];

export declare function replayHookRoundtrip(): readonly string[];
