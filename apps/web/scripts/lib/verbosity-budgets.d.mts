export type VerbosityView = { readonly total: number; readonly firstScreen: number };
export type VerbosityMeasure = { readonly views: Readonly<Record<string, VerbosityView>>; readonly uncovered: Readonly<Record<string, string>> };
export type VerbosityReleve = { readonly de: VerbosityView; readonly a: VerbosityView; readonly motif: string; readonly issue: number };
export type VerbosityBudgets = VerbosityMeasure & { readonly releves?: Readonly<Record<string, VerbosityReleve>> };
export declare function budgetsFromMeasure(measured: VerbosityMeasure, current?: { readonly releves?: Readonly<Record<string, VerbosityReleve>> }): VerbosityBudgets;
export declare function socleProblems(input: { readonly socle: VerbosityMeasure; readonly previousSocle: VerbosityMeasure | null }): readonly string[];
export declare function verbosityProblems(input: {
  readonly listed: readonly string[];
  readonly measured: VerbosityMeasure;
  readonly budgets: VerbosityBudgets;
  readonly previous: VerbosityMeasure | null;
  readonly socle?: VerbosityMeasure | null;
}): readonly string[];
