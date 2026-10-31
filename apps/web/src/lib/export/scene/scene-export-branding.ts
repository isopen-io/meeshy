import type { PreparedSceneExport } from './scene-export-assets';
import { brandingIdentityOf, type BrandingAuthor, type BrandingIdentity } from './scene-export-branding-identity';
import { resolveRelationLevel, type RelationLevelProvider } from './scene-export-branding-level';
import type { BrandingImages } from './scene-export-branding-paint';
import { brandedTimeline, makeBrandingPlan, shiftedPlan, type BrandedTimeline, type BrandingPlan } from './scene-export-branding-plan';

/**
 * **PRÉPARER L'EMBALLAGE DE MARQUE** (#13997, #10537) — tout ce que l'intro et
 * la carte de fin ont besoin d'avoir en main avant la première image : le
 * niveau de lien (port injecté, BORNÉ), l'avatar et la bannière décodés
 * (bornés aussi), l'identité qui en découle, puis le plan de la scène décalé
 * derrière l'intro.
 *
 * Le préambule ne retarde jamais l'export au-delà de `budgetMs` : un logo qui
 * n'arrive pas, une photo qui tarde, et l'intro se peint sans eux.
 */

export type PreparedBranding = {
  readonly identity: BrandingIdentity | null;
  readonly images: BrandingImages;
  readonly plan: BrandingPlan;
};

export type AppliedBranding = {
  readonly timeline: BrandedTimeline;
  readonly identity: BrandingIdentity | null;
  readonly images: BrandingImages;
};

export type BrandingDeps = {
  readonly loadImage: (src: string) => Promise<CanvasImageSource | null>;
  readonly relationLevel: RelationLevelProvider;
  readonly now: () => number;
  /** Le budget du préambule entier (niveau + images). */
  readonly budgetMs: number;
};

export const BRANDING_BUDGET_MS = 2_500;

const NO_IMAGES: BrandingImages = { avatar: null, banner: null };

async function boundedImage(src: string | null, deps: BrandingDeps): Promise<CanvasImageSource | null> {
  if (src === null) return null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const budget = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), deps.budgetMs);
  });
  try {
    return await Promise.race([deps.loadImage(src).catch(() => null), budget]);
  } finally {
    clearTimeout(timer);
  }
}

export async function prepareBranding(params: { readonly author: BrandingAuthor | null; readonly deps: BrandingDeps; readonly signal: AbortSignal }): Promise<PreparedBranding> {
  const { author, deps, signal } = params;
  if (author === null) return { identity: null, images: NO_IMAGES, plan: makeBrandingPlan({ hasIntro: false, hasAuthorOutro: false }) };
  const [level, avatar, banner] = await Promise.all([
    resolveRelationLevel({ provider: deps.relationLevel, authorId: author.authorId, self: author.self, budgetMs: deps.budgetMs, signal }),
    boundedImage(author.avatarSrc, deps),
    boundedImage(author.bannerSrc, deps),
  ]);
  return {
    identity: brandingIdentityOf({ author, level, now: deps.now() }),
    images: { avatar, banner },
    plan: makeBrandingPlan({ hasIntro: true, hasAuthorOutro: true }),
  };
}

/** Pose la scène derrière l'intro et sous la carte de fin : la durée rendue est celle de l'ensemble. */
export function withBranding(prepared: PreparedSceneExport, branding: PreparedBranding): PreparedSceneExport {
  const timeline = brandedTimeline({ plan: branding.plan, storyMs: prepared.plan.totalMs });
  return {
    ...prepared,
    plan: shiftedPlan({ plan: prepared.plan, offsetMs: timeline.storyStartMs, totalMs: timeline.totalMs }),
    branding: { timeline, identity: branding.identity, images: branding.images },
  };
}
