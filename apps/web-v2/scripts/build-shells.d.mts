/**
 * Les types du module voisin — voir `institutional-routes.d.mts` (`scripts/lib/`)
 * pour la raison d'être de ce motif : trois runtimes distincts (Vite, bun,
 * node) consomment ce fichier, seul le premier lit du TypeScript.
 */
export declare const REFERENCE_IOS_SIMULATOR_UDID: string;
export declare const SHELL_IOS_SIMULATOR_UDID: string;

export type ShellTarget = 'android' | 'ios' | 'both';

export type ShellBuildEnv = Readonly<{
  readonly [key: string]: unknown;
  readonly VITE_API_BASE?: string;
  readonly VITE_DATA_SOURCE?: string;
  readonly MEESHY_SHELL_START_PATH?: string;
  readonly target?: string;
}>;

export type ResolvedShellBuildEnv = Readonly<{
  readonly apiBase: string;
  readonly dataSource: 'gateway';
  readonly target: ShellTarget;
}>;

export declare function resolveShellBuildEnv(env: ShellBuildEnv): ResolvedShellBuildEnv;

export declare function resolveShellSimulatorUdid(
  env: Readonly<{ readonly MEESHY_SHELL_IOS_UDID?: string }>,
): string;

export declare function auditSyncedShellConfig(json: string): readonly string[];

export type ShellBundleFile = Readonly<{ readonly path: string; readonly text: string }>;

export declare function auditShellBundle(
  files: readonly ShellBundleFile[],
  options: Readonly<{ readonly apiBase: string }>,
): readonly string[];

export declare function resolveShellVersion(packageJsonRaw: string): string;

export declare function auditAndroidVersionName(gradleText: string, version: string): readonly string[];

export declare function deriveAndroidVersionName(gradleText: string, version: string): string;

export declare function auditIosMarketingVersion(pbxprojText: string, version: string): readonly string[];

export declare function deriveIosMarketingVersion(pbxprojText: string, version: string): string;
