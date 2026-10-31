// SQUELETTE (RED) — rempli au commit suivant.
import type { RelationLevel } from '../types/relation.js';
import type { GlobalUserRoleType } from '../types/role-types.js';
import type { RelationFeature } from './relation-levels.js';

export type RelationAgeClass = 'minor' | 'adult' | 'unknown';
export type RelationAccessInput = {
  readonly viewerId: string;
  readonly targetId: string;
  readonly grantedByViewer: RelationLevel;
  readonly grantedByTarget: RelationLevel;
  readonly sharesCommunity: boolean;
  readonly blockedEitherWay: boolean;
  readonly viewerMinor: RelationAgeClass;
  readonly targetMinor: RelationAgeClass;
  readonly viewerRole?: GlobalUserRoleType | null;
  readonly feature: RelationFeature;
};
export type RelationAccessReason = 'level' | 'blocked' | 'minor' | 'self' | 'role';
export type RelationAccess = {
  readonly allowed: boolean;
  readonly effectiveLevel: RelationLevel;
  readonly reason: RelationAccessReason;
  readonly requiresConsent: boolean;
};
export const resolveRelationAccess = (_input: RelationAccessInput): RelationAccess => ({
  allowed: false,
  effectiveLevel: 'PUBLIC',
  reason: 'level',
  requiresConsent: false,
});
