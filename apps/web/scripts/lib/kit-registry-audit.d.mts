export type KitLot = { readonly key: string; readonly name: string; readonly target: string };
export type KitAuditState = { readonly id: string; readonly boardView: string | null; readonly isTouchable: boolean };
export type KitAuditEntry = { readonly key: string; readonly name: string; readonly states: readonly KitAuditState[] };
export type KitDisk = { readonly existing: ReadonlySet<string>; readonly images: readonly string[] };

export declare const KIT_WIDTHS: readonly number[];
export declare const KIT_BOARD_ID: string;
export declare const KIT_COMPACT_WIDTH: number;
export declare const KIT_CATALOGUE_NAME: string;
export declare const KIT_EMPTY_STATE: KitAuditState;
export declare function kitLotsOf(registry: { readonly lots: readonly Record<string, unknown>[] }): readonly KitLot[];
export declare function boardViewIds(html: string): ReadonlySet<string>;
export declare function witnessPath(target: string): string;
export declare function candidatePaths(lots: readonly KitLot[]): readonly string[];
export declare function variantsOf(state: Pick<KitAuditState, 'isTouchable'>): readonly string[];
export declare function imageStem(input: { readonly id: string; readonly variant: string; readonly width: number }): string;
export declare function expectedStems(states: readonly KitAuditState[]): readonly string[];
export declare function imageProblems(input: { readonly label: string; readonly name: string; readonly states: readonly KitAuditState[]; readonly images: readonly string[] }): readonly string[];
export declare function catalogueProblems(input: { readonly images: readonly string[] }): readonly string[];
export declare function sequenceProblems(input: { readonly lots: readonly KitLot[]; readonly entries: readonly KitAuditEntry[] }): readonly string[];
export declare function lotProblems(input: { readonly lot: KitLot; readonly entry: KitAuditEntry; readonly boardViewIds: ReadonlySet<string>; readonly disk: KitDisk }): readonly string[];
export declare function auditKitRegistry(input: {
  readonly lots: readonly KitLot[];
  readonly entries: readonly KitAuditEntry[];
  readonly boardViewIds: ReadonlySet<string>;
  readonly disk: KitDisk;
}): readonly string[];
