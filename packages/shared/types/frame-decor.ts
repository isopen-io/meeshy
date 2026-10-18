/**
 * Les briques COMMUNES aux contours d'avatar et aux cadres de bannière (#10932) :
 * les dégradés et les mouvements déclarés. Squelette — le schéma arrive avec ses témoins.
 */
export const FRAME_MOTION_KINDS = ['rotate', 'pulse', 'sweep', 'twinkle', 'skew'] as const;
export type FrameMotionKind = (typeof FRAME_MOTION_KINDS)[number];
