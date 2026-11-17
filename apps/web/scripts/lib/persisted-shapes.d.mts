export type ShapeField = { readonly optional: boolean; readonly type: Shape };
export type ShapeIndex = { readonly key: string; readonly type: Shape };

/** La description structurelle d'un type rangé — voir `persisted-shapes.mjs`. */
export type Shape =
  | { readonly primitive: string }
  | { readonly ref: string }
  | { readonly named: string }
  | { readonly array: Shape }
  | { readonly tuple: readonly Shape[] }
  | { readonly union: readonly Shape[] }
  | { readonly intersection: readonly Shape[] }
  | { readonly object: Readonly<Record<string, ShapeField>>; readonly indexes?: readonly ShapeIndex[] }
  | { readonly callable: string }
  | { readonly cycle: string }
  | { readonly deep: string };

export type ShapeTables = { readonly old: Readonly<Record<string, Shape>>; readonly current: Readonly<Record<string, Shape>> };

export type PersistedShapesDescription = {
  readonly families: Readonly<Record<string, Shape>>;
  readonly types: Readonly<Record<string, Shape>>;
};

export type PersistedShapesLock = PersistedShapesDescription & { readonly schema: number };

export type PersistedShapesVerdict = {
  readonly status: 'à-jour' | 'compatible' | 'incompatible' | 'schéma-incrémenté';
  readonly problems: readonly string[];
};

export declare const WEB_ROOT: string;
export declare const REGISTRY_FILE: string;
export declare const LOCK_FILE: string;
export declare function readCacheSchema(): number;
export declare function describePersistedShapes(): PersistedShapesDescription;
export declare function judgeShapeChange(old: Shape, current: Shape, tables: ShapeTables, where?: string, pending?: ReadonlySet<string>): readonly string[];
export declare function judgePersistedShapes(input: { readonly lock: PersistedShapesLock; readonly current: PersistedShapesDescription; readonly schema: number }): PersistedShapesVerdict;
