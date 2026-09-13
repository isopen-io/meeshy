/**
 * LA LOI DU TIRER-POUR-RAFRAÎCHIR (#6195) — miroir de
 * `MeeshyRefreshableScroll.next(pullDistance:threshold:)`
 * (`packages/MeeshySDK/Sources/MeeshyUI/Primitives/MeeshyRefreshableScroll.swift:188-216`),
 * gardée par `check-curve.mjs` (extraction de `pullThreshold`).
 */
export const PULL_THRESHOLD = 90;

export type PullPhase =
  | { readonly kind: 'idle' }
  | { readonly kind: 'pulling'; readonly progress: number }
  | { readonly kind: 'armed' }
  | { readonly kind: 'refreshing' }
  | { readonly kind: 'completing'; readonly outcome: 'ok' | 'failed' };

/**
 * `null` ⇒ le geste est IGNORÉ (`refreshing`/`completing` ne réagissent plus
 * au doigt, iOS `:200`) ; l'armement ne se rend qu'UNE fois — un second appel
 * déjà `armed` au-delà du seuil rend `null` (iOS `:212-214`). `distance <= 0`
 * ⇒ `idle` (miroir de `MeeshyPullPhaseLaw.next`, `guard pullDistance > 0`,
 * `MeeshyRefreshableScroll.swift:206-209` — revue-correction #6195, défaut 7 :
 * la garde vit dans la LOI, pas dans la discipline de l'appelant).
 */
export function nextPullPhase(phase: PullPhase, distance: number, threshold: number): PullPhase | null {
  if (phase.kind === 'refreshing' || phase.kind === 'completing') return null;
  if (distance <= 0) return phase.kind === 'idle' ? null : { kind: 'idle' };
  if (threshold <= 0 || distance >= threshold) return phase.kind === 'armed' ? null : { kind: 'armed' };
  return { kind: 'pulling', progress: distance / threshold };
}

/** Le relâchement du doigt (`touchend`) : `armed` DÉCLENCHE, `pulling`
 * abandonne sans appel, `idle` ne change rien. */
export function releasePull(phase: PullPhase): PullPhase {
  if (phase.kind === 'armed') return { kind: 'refreshing' };
  if (phase.kind === 'pulling') return { kind: 'idle' };
  return phase;
}

/** La durée du RETOUR à sa place, une fois le doigt parti. */
export const PULL_SETTLE_MS = 200;

export type PullTransformStyle = {
  readonly transform: string;
  readonly transitionProperty?: string;
  readonly transitionDuration?: string;
};

/**
 * LE DÉPLACEMENT DU SCROLLPORT PENDANT LE TIRER (revue-correction #6195) —
 * `transform`, JAMAIS `padding`/`margin` : `offsetTop` de chaque rangée reste
 * INVARIANT (l'invariant que `check-lens.mjs` § 9 mesure).
 *
 * DEUX RÉGIMES, et c'est tout l'objet de cette fonction. DOIGT POSÉ
 * (`pulling`/`armed`) : AUCUNE transition — la liste suit le doigt à l'image
 * près. Une transition ici la fait TRAÎNER derrière le doigt, ce que la
 * dimension 4 (« y a-t-il UNE image perdue pendant le geste ? ») interdit.
 * DOIGT PARTI (`refreshing`/`completing`) : la transition, sinon la liste
 * CLAQUE à sa place à la fin du rafraîchissement.
 *
 * `undefined` au repos : aucune propriété n'est laissée sur le scrollport —
 * pas de couche de composition permanente sous `position: sticky`. Le prix
 * assumé est le seul chemin non animé, l'ABANDON (doigt relâché sous le
 * seuil, `pulling → idle`) : la liste y revient en une image. Lui donner sa
 * transition demanderait une phase de plus que les six d'iOS
 * (`MeeshyRefreshableScroll.swift`), pour la seule branche « rien ne s'est
 * passé ».
 */
export function pullTransform(phase: PullPhase, offsetPx: number): PullTransformStyle | undefined {
  if (phase.kind === 'idle') return undefined;
  const transform = `translateY(${offsetPx}px)`;
  if (phase.kind === 'pulling' || phase.kind === 'armed') return { transform };
  return { transform, transitionProperty: 'transform', transitionDuration: `${PULL_SETTLE_MS}ms` };
}
