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

export declare function auditIosInfoPlistVersionForm(plistXml: string): readonly string[];

export type ShellBuildNumberEnv = Readonly<{ readonly [key: string]: unknown; readonly MEESHY_SHELL_BUILD_NUMBER?: string }>;

export declare function resolveShellBuildNumber(
  options: Readonly<{ readonly env: ShellBuildNumberEnv; readonly commitCount: number; readonly shallow: boolean }>,
): number;

export declare function stripGradleComments(gradleText: string): string;

export declare function auditAndroidVersionCodeForm(gradleText: string): readonly string[];

export declare function auditCommittedBuildNumberFallback(
  files: Readonly<{ readonly gradleText: string; readonly pbxprojText: string }>,
): readonly string[];

/**
 * Type SOMME, pas un `udid?: string` : la destination est OBLIGATOIRE sur iOS
 * et n'a aucun sens sur Android. Un optionnel laissait composer
 * `-destination id=undefined` sans qu'aucun compilateur ne s'en mêle.
 */
export type NativeBuildTarget =
  | Readonly<{ readonly target: 'android'; readonly buildNumber: number; readonly version: string }>
  | Readonly<{
      readonly target: 'ios';
      readonly buildNumber: number;
      readonly version: string;
      readonly udid: string;
    }>;

export declare function nativeBuildArgs(options: NativeBuildTarget): readonly string[];

export type ShellVersionExpectation = Readonly<{ readonly version: string; readonly buildNumber: number }>;

export declare function auditBuiltApkVersion(
  outputMetadataJson: string,
  expectation: ShellVersionExpectation,
): readonly string[];

export declare function auditBuiltIosAppVersion(
  infoPlistJson: string,
  expectation: ShellVersionExpectation,
): readonly string[];
