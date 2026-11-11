export type VerbosityView = { readonly total: number; readonly firstScreen: number };
export type VerbosityMeasure = { readonly views: Readonly<Record<string, VerbosityView>>; readonly uncovered: Readonly<Record<string, string>> };
export declare function budgetsFromMeasure(measured: VerbosityMeasure): VerbosityMeasure;
export declare function verbosityProblems(input: {
  readonly listed: readonly string[];
  readonly measured: VerbosityMeasure;
  readonly budgets: VerbosityMeasure;
  readonly previous: VerbosityMeasure | null;
}): readonly string[];
