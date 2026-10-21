/**
 * Les types du module voisin — voir `scripts/lib/institutional-routes.d.mts`
 * pour la raison d'être de ce motif : le gate reste du JavaScript lu par node,
 * son témoin est du TypeScript lu par bun et par `tsc`.
 */
export type PermissionViolation = Readonly<{
  readonly permission: string;
  readonly count: number;
}>;

export declare const REQUIRED_PERMISSIONS: readonly string[];

export declare function auditManifestPermissions(
  options: Readonly<{ readonly manifest: string; readonly required?: readonly string[] }>,
): readonly PermissionViolation[];

export declare const FORBIDDEN_PERMISSIONS: readonly string[];

export declare function auditForbiddenPermissions(
  options: Readonly<{ readonly manifest: string; readonly forbidden?: readonly string[] }>,
): readonly string[];

export declare const CALL_ONLY_PERMISSIONS: readonly string[];

export declare function requiredPermissions(options: Readonly<{ readonly callsEnabled: boolean }>): readonly string[];

export declare function forbiddenPermissions(options: Readonly<{ readonly callsEnabled: boolean }>): readonly string[];

export declare function callsEnabledIn(callPushSource: string): boolean;

export declare function auditCallComponents(
  options: Readonly<{ readonly manifest: string; readonly callsEnabled?: boolean }>,
): readonly string[];

export declare function formatViolations(
  options: Readonly<{ readonly manifestPath: string; readonly violations: readonly PermissionViolation[] }>,
): string;

export declare const SHARE_INTENT_FILTERS: readonly Readonly<{ readonly action: string; readonly mimeTypes: readonly string[] }>[];

export declare function auditShareIntentFilters(
  options: Readonly<{ readonly manifest: string; readonly required?: typeof SHARE_INTENT_FILTERS }>,
): readonly string[];
