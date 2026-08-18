/**
 * Perspective de la Lentille — la même courbe, deux jeux de constantes
 * (workshop amendement A3 : « une forme, deux jeux de constantes »).
 *
 * `focusCurve` transforme une distance verticale au focus en `{ alpha, scale
 * }` — jamais une hauteur, jamais une police (invariant §4.1 : la
 * perspective ne touche pas la géométrie du rang). `electFocusRow` élit,
 * parmi des candidats de rang, celui qui occupe la carte de focus, avec une
 * bande d'hystérésis qui empêche le gagnant de trembler.
 *
 * Fonctions pures, aucun I/O, aucune dépendance de plateforme — les peaux
 * (SwiftUI `FocalFocusCurve`/`FocalFocusElector`, hooks React, Compose)
 * consomment cette loi, jamais l'inverse (garde R15 : aucune de ces
 * constantes n'est réécrite en dur hors `packages/shared/`).
 *
 * @see tasks/lentille-implementation-contract.md LWS-0, §4.1, §4.2
 * @see tasks/lentille-focal-workshop.md A3
 */

export type FocusCurveVariant = 'thread' | 'list'

export type FocusCurveResult = {
  readonly alpha: number
  readonly scale: number
}

/**
 * Constantes gelées de la loi de focus (RÉSERVE 1, revue REV-1) — seule
 * source de vérité pour les trois jeux de constantes de `focusCurve`.
 * `thread` (Focal, fil), `list` (Lentille, liste), `belowBand` (fondu court
 * sous la bande de focus, liste uniquement, §4.1).
 *
 * Exportée gelée (`as const`) pour que les peaux et outillages puissent
 * introspecter les constantes sans les redéclarer en dur (garde R15).
 */
export const FOCUS_CURVE_CONSTANTS = {
  thread: { maxDistance: 380, scaleDecay: 0.4, alphaDecay: 0.82 },
  list: { maxDistance: 520, alphaDecay: 0.45, scaleDecay: 0.04 },
  belowBand: { distance: 160, alphaCap: 0.35 },
} as const

/**
 * Fil (Focal) : `f = min(1, d/380)`, `scale = 1 − 0.40f` (plancher 0.60),
 * `alpha = 1 − 0.82f` (plancher 0.18) — spec « Focal Grandeur Nature » §3/§5
 * (`docs/design/2026-08-15-focal-spec-integration.html`), réancrée comme
 * contrat le 2026-08-18. Les cotes 520/0.38/0.78 transposées de la maquette
 * vol. 3 (`0612c8ca`) sont retirées : le vol. 4 fait foi.
 */
export const THREAD_MAX_DISTANCE = FOCUS_CURVE_CONSTANTS.thread.maxDistance
export const THREAD_SCALE_DECAY = FOCUS_CURVE_CONSTANTS.thread.scaleDecay
export const THREAD_ALPHA_DECAY = FOCUS_CURVE_CONSTANTS.thread.alphaDecay

/** Liste (Lentille) : `f = min(1, d/520)`, `alpha = 1 − 0.45f`, `scale = 1 − 0.04f`. */
export const LIST_MAX_DISTANCE = FOCUS_CURVE_CONSTANTS.list.maxDistance
export const LIST_ALPHA_DECAY = FOCUS_CURVE_CONSTANTS.list.alphaDecay
export const LIST_SCALE_DECAY = FOCUS_CURVE_CONSTANTS.list.scaleDecay

/**
 * Fondu court sous la bande de focus (liste uniquement, §4.1 : « sous la
 * bande : fondu court sur d/160, plafonné à −0.35 »). Rampe PROPORTIONNELLE
 * plafonnée — corrigée REV-1 BLOCAGE 1 (maquette normative
 * `docs/design/2026-08-15-conversation-list-lentille.html:647` :
 * `op = 1 − 0.35·min(1, d/160)`), jamais une rampe linéaire non mise à
 * l'échelle (l'ancienne implémentation `max(d/160, −0.35)` saturait à
 * `d=-56` au lieu de `d=-160`).
 */
export const LIST_BELOW_BAND_DISTANCE = FOCUS_CURVE_CONSTANTS.belowBand.distance
export const LIST_BELOW_BAND_ALPHA_CAP = FOCUS_CURVE_CONSTANTS.belowBand.alphaCap

/**
 * Bande de focus (§4.2 : « bottom − 140 ± 45 ») — RÉSERVE 2, revue REV-1.
 * `FOCUS_BAND_OFFSET` : distance verticale entre le bas du viewport et le
 * centre de la bande de focus. `FOCUS_BAND_HALF_HEIGHT` : demi-hauteur de la
 * bande, c'est-à-dire l'hystérésis passée à `electFocusRow`. Exportées pour
 * que les peaux (I-070/WL-104…) ne les réécrivent JAMAIS en dur.
 */
export const FOCUS_BAND_OFFSET = 140
export const FOCUS_BAND_HALF_HEIGHT = 45

/**
 * Bande de focus du FIL (Focal) — spec « Focal Grandeur Nature » §5 :
 * `focusY = bas − 150`, élu = le plus proche avec hystérésis 95 px
 * (recette §7 : « sans oscillation entre deux rangées (hystérésis 95 px) »).
 * DISTINCTE de la bande de la LISTE (`FOCUS_BAND_OFFSET` 140 ± 45), que la
 * Lentille et la Rivière conservent — deux vues, deux bandes, une seule loi.
 */
export const THREAD_FOCUS_BAND_OFFSET = 150
export const THREAD_FOCUS_BAND_HYSTERESIS = 95

const clampUnit = (value: number): number => Math.min(1, Math.max(0, value))

/**
 * Interprétation du signe de `distance` (documentée ici car §4.1 la laisse
 * implicite, et le contrat exige qu'elle soit explicitée) :
 *
 *   - `distance` est la distance verticale AU-DESSUS de la bande de focus
 *     (§4.1 : « d = distance verticale au-dessus de la bande de focus »).
 *     Un rang qui défile loin au-dessus de la bande a `distance` grand et
 *     positif ; un rang PILE dans la bande a `distance = 0`.
 *   - `distance < 0` signifie que le rang est SOUS la bande de focus (plus
 *     bas à l'écran que la carte élue) — cas marginal en liste puisque la
 *     bande de focus est ancrée près du bas de l'écran (§4.2), donc très
 *     peu de rangs se trouvent sous elle.
 *   - Le terme `f = min(1, d/…)` du variant `list` est borné à `[0, 1]`
 *     (`clampUnit`) : pour `distance < 0`, `f = 0`, donc le terme de base ne
 *     contribue AUCUN fondu (`alpha` de base reste `1`, `scale` reste `1`).
 *     Le fondu sous la bande est un terme ADDITIF distinct — c'est le sens
 *     du « PLUS » du contrat : `belowBandFade = −0.35 · clampUnit(−d/160)`
 *     (BLOCAGE 1, correction REV-1 — rampe PROPORTIONNELLE plafonnée, jamais
 *     `max(d/160, −0.35)` : cette ancienne forme confondait la pente de la
 *     rampe et son plafond, saturant à `d=-56` au lieu de `d=-160`). Reprise
 *     littérale de la maquette normative
 *     `docs/design/2026-08-15-conversation-list-lentille.html:647` :
 *     `op = 1 − 0.35·min(1, d/160)` où le `d` de la maquette est la distance
 *     SOUS la bande (positive), soit `−distance` dans la convention de ce
 *     fichier. Le fondu total sous la bande est donc `1 + belowBandFade`,
 *     borné à `[0.65, 1]` — un fondu volontairement COURT (rayon d'action
 *     `160px` contre `520px` au-dessus de la bande), cohérent avec « la
 *     carte de focus est déjà là, les quelques rangs sous elle ne doivent
 *     presque pas s'estomper ».
 *   - Le variant `thread` n'a pas d'amendement « sous la bande » dans le
 *     contrat ; par symétrie et pour rester une loi pure et totale, une
 *     distance négative y est traitée comme dans le terme de base du
 *     variant `list` : `f` est bornée à `[0, 1]`, donc `distance ≤ 0` rend
 *     `alpha = 1` et `scale = 1` (le rang pile au focus, ou « au-delà »
 *     dans le sens du focus, ne s'estompe ni ne rétrécit).
 */
export const focusCurve = (
  distance: number,
  variant: FocusCurveVariant,
): FocusCurveResult => {
  if (variant === 'thread') {
    const f = clampUnit(distance / THREAD_MAX_DISTANCE)
    return {
      alpha: 1 - THREAD_ALPHA_DECAY * f,
      scale: 1 - THREAD_SCALE_DECAY * f,
    }
  }

  const f = clampUnit(distance / LIST_MAX_DISTANCE)
  const belowBandFade =
    distance < 0
      ? -LIST_BELOW_BAND_ALPHA_CAP * clampUnit(-distance / LIST_BELOW_BAND_DISTANCE)
      : 0

  return {
    alpha: clampUnit(1 - LIST_ALPHA_DECAY * f + belowBandFade),
    scale: 1 - LIST_SCALE_DECAY * f,
  }
}

/**
 * Élection de la focus card (§4.2) — bande d'hystérésis : le rang courant
 * garde la main tant que son `midY` reste dans `focusY ± hysteresis` ;
 * sinon le candidat dont le `midY` est le plus proche de `focusY` gagne.
 * Départage déterministe par `id` croissant à égalité de distance.
 *
 * « La carte suit le défilement, jamais les événements » (§4.2) : cette loi
 * ne consulte que les positions données en entrée, jamais une horloge ni un
 * flux d'événements — c'est aux peaux d'appeler `electFocusRow` à chaque
 * passe de défilement.
 */
export type FocusRowCandidate = {
  readonly id: string
  readonly midY: number
}

export type ElectFocusRowInput = {
  readonly candidates: readonly FocusRowCandidate[]
  readonly focusY: number
  readonly currentId: string | null
  readonly hysteresis: number
}

export const electFocusRow = ({
  candidates,
  focusY,
  currentId,
  hysteresis,
}: ElectFocusRowInput): string | null => {
  if (candidates.length === 0) {
    return null
  }

  const current =
    currentId === null
      ? undefined
      : candidates.find((candidate) => candidate.id === currentId)

  if (current !== undefined && Math.abs(current.midY - focusY) <= hysteresis) {
    return current.id
  }

  const winner = candidates.reduce<FocusRowCandidate | null>((best, candidate) => {
    if (best === null) {
      return candidate
    }
    const bestDistance = Math.abs(best.midY - focusY)
    const candidateDistance = Math.abs(candidate.midY - focusY)
    if (candidateDistance < bestDistance) {
      return candidate
    }
    if (candidateDistance > bestDistance) {
      return best
    }
    return candidate.id < best.id ? candidate : best
  }, null)

  // Unreachable given the `candidates.length === 0` guard above — kept as an
  // honest null-check rather than a non-null assertion (no `!`, no `any`).
  return winner === null ? null : winner.id
}
