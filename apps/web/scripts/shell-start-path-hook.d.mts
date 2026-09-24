/**
 * Les types du module voisin — voir `scripts/lib/institutional-routes.d.mts`
 * pour la raison d'être de ce motif : trois runtimes distincts (Vite, bun,
 * node) consomment ce fichier, seul le premier lit du TypeScript.
 */
export declare const IOS_NATIVE_WEB_DIR: string;
export declare const HOOK_PHASES: readonly ['before', 'after'];

export type StartPathHookPhase = (typeof HOOK_PHASES)[number];

export type StartPathHookEnv = Readonly<{
  readonly [key: string]: unknown;
  readonly CAPACITOR_CONFIG?: string;
  readonly CAPACITOR_PLATFORM_NAME?: string;
  readonly CAPACITOR_ROOT_DIR?: string;
  readonly MEESHY_SHELL_SYNC_TARGET?: string;
}>;

export type StartPathHookPlan =
  | Readonly<{ readonly action: 'skip'; readonly reason: string }>
  | Readonly<{ readonly action: 'place'; readonly filePath: string }>;

export declare function planStartPathHook(env: StartPathHookEnv, phase: string): StartPathHookPlan;

export type StartPathHookFs = Readonly<{
  readonly existsSync: (path: string) => boolean;
  readonly mkdirSync: (path: string, options?: Readonly<{ readonly recursive?: boolean }>) => unknown;
  readonly writeFileSync: (path: string, contents: string) => void;
}>;

export declare function applyStartPathPlan(
  plan: StartPathHookPlan,
  fs: StartPathHookFs,
): Readonly<{ readonly placed: boolean }>;
