/**
 * Les types du module voisin — même motif que `await-fact.d.mts` : plusieurs
 * runtimes consomment le `.mjs`, seul `tsc` lit ces déclarations.
 */

export declare const SWIFT_VALUE: string;

export type SwiftDesignTokens = {
  value(raw: string): number | null;
  veilOpacity(raw: string): number | null;
};

export declare function swiftDesignTokens(sources: { designTokens: string; colors: string }): SwiftDesignTokens;

export declare function readSwiftDesignTokens(root: string): SwiftDesignTokens;
