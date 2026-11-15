export type KitGlassMeasure = { readonly calls: number; readonly files: number; readonly rounds: number; readonly untouched: number };
export declare const KIT_GLASS_CLASSES: readonly string[];
export declare function isOutsideKit(path: string): boolean;
export declare function measureKitGlass(sources: readonly { readonly path: string; readonly text: string }[]): KitGlassMeasure;
export declare function ratchetProblems(input: { readonly measured: KitGlassMeasure; readonly ceiling: KitGlassMeasure }): readonly string[];
