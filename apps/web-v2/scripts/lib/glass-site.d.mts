/**
 * Les types du module voisin — même motif que `files.d.mts` : bun et node
 * consomment le `.mjs`, seul `tsc` lit ces déclarations.
 */
export type GlassKind = 'blur' | 'translucent-tone' | 'glass-override';
export type GlassSource = { readonly path: string; readonly text: string };
export type GlassAllowance = { readonly count: number; readonly reason: string };
export type GlassInventory = Readonly<Record<string, Partial<Record<GlassKind, GlassAllowance>>>>;
export type GlassViolation = {
  readonly path: string;
  readonly kind: GlassKind;
  readonly found: number;
  readonly allowed: number;
};

export declare const GLASS_SITE: string;
export declare const GLASS_INVENTORY: GlassInventory;
export declare function glassViolations(
  sources: readonly GlassSource[],
  inventory?: GlassInventory,
): readonly GlassViolation[];
