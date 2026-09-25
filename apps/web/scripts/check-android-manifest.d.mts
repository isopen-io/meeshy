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

export declare function formatViolations(
  options: Readonly<{ readonly manifestPath: string; readonly violations: readonly PermissionViolation[] }>,
): string;
