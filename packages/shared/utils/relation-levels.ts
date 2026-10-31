// SQUELETTE (RED) — rempli au commit suivant.
import type { RelationLevel } from '../types/relation.js';

export type RelationFeature = string;
export const RELATION_FEATURE_MIN_LEVEL: Readonly<Record<string, RelationLevel>> = {};
export const RELATION_CONSENT_FEATURES: ReadonlySet<string> = new Set();
export const RELATION_DIRECTED_FEATURES: ReadonlySet<string> = new Set();
export const RELATION_PRESENCE_FEATURES: ReadonlySet<string> = new Set();
export const RELATION_LEVEL_PRESENTATION: Readonly<Record<string, { labelKey: string; icon: string }>> = {};
export const RELATION_LEVEL_LABELS: Readonly<Record<string, Record<string, string>>> = {};
export const RELATION_THRESHOLDS = {} as never;
export const relationThresholdsFor = (_environment: string | undefined): never => ({}) as never;
