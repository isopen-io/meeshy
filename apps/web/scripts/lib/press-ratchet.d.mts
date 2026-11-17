export type PressMeasure = { readonly elements: number; readonly mute: number; readonly durations: number; readonly durationFiles: number };
export type PressCeiling = { readonly mute: number; readonly durations: number };
export declare const PRESS_MARKS: readonly string[];
export declare function isMeasured(path: string): boolean;
export declare function measurePress(sources: readonly { readonly path: string; readonly text: string }[]): PressMeasure;
export declare function pressRatchetProblems(input: { readonly measured: PressCeiling; readonly ceiling: PressCeiling }): readonly string[];
