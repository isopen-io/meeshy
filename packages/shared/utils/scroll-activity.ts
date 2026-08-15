/**
 * Loi de l'activité de défilement — machine à états pure, sérialisable.
 *
 * Une loi, deux libellés (workshop amendement A4) : la pilule jour·heure du
 * fil (Focal) ET la pilule de section de la liste (Lentille) consomment
 * cette MÊME loi et cette MÊME constante — seul le texte affiché diffère,
 * jamais le timing.
 *
 * Sémantique :
 *   - invisible à l'ouverture (`initialState()`)
 *   - visible au premier `scrolled`
 *   - invisible EXACTEMENT `SCROLL_ACTIVITY_LINGER_MS` après le DERNIER
 *     `scrolled` — la borne est incluse dans la fenêtre invisible : à
 *     `lastScrolledAt + SCROLL_ACTIVITY_LINGER_MS` pile, l'état est déjà
 *     invisible (contrat : « invisible exactement 900 ms après » = la
 *     visibilité couvre l'intervalle semi-ouvert `[lastScrolledAt,
 *     lastScrolledAt + 900)`, jamais la borne elle-même)
 *   - chaque `scrolled` réarme le timer (le dernier gagne)
 *
 * Timestamps injectés en millisecondes ; JAMAIS `Date.now()` dans cette loi
 * — les peaux (hooks React, timers Swift/Kotlin) sont seules responsables
 * de l'horloge murale et de la boucle de `tick`.
 *
 * @see tasks/lentille-implementation-contract.md LWS-0
 * @see Miroir Swift : `Focal/Core/ScrollTimePillLaw.swift` (M-044)
 */

/** Fenêtre de persistance de la pilule après le dernier `scrolled`, en ms. Constante UNIQUE — consommée par les deux peaux (garde R15). */
export const SCROLL_ACTIVITY_LINGER_MS = 900

export type ScrollActivityEvent =
  | { readonly type: 'scrolled'; readonly at: number }
  | { readonly type: 'tick'; readonly at: number }

export type ScrollActivityState = {
  readonly lastScrolledAt: number | null
}

export const initialState = (): ScrollActivityState => ({
  lastScrolledAt: null,
})

export const reduce = (
  state: ScrollActivityState,
  event: ScrollActivityEvent,
): ScrollActivityState => {
  if (event.type === 'scrolled') {
    return { lastScrolledAt: event.at }
  }
  return state
}

export const isVisible = (state: ScrollActivityState, at: number): boolean => {
  if (state.lastScrolledAt === null) {
    return false
  }
  return at - state.lastScrolledAt < SCROLL_ACTIVITY_LINGER_MS
}

export const scrollActivityLaw = {
  initialState,
  reduce,
  isVisible,
}
