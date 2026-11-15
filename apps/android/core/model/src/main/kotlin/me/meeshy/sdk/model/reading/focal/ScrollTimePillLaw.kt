package me.meeshy.sdk.model.reading.focal

/** Événement de la loi de la pilule : l'horodatage vient TOUJOURS de l'appelant, jamais d'une horloge murale. */
public sealed interface ScrollActivityEvent {
    /** L'utilisateur fait défiler : réarme le timer, le dernier gagne. */
    public data class Scrolled(val at: Double) : ScrollActivityEvent

    /** Pulsation d'horloge de la peau : ne réarme JAMAIS le timer. */
    public data class Tick(val at: Double) : ScrollActivityEvent
}

/** État de la loi ; `lastScrolledAt` null = jamais défilé. */
public data class ScrollActivityState(val lastScrolledAt: Double?)

/**
 * Loi de l'activité de défilement, miroir de `scrollActivityLaw` (`packages/shared/utils/scroll-activity.ts`)
 * et de `ScrollTimePillLaw.swift`. Une loi, deux libellés : la pilule jour·heure du fil et la pilule de
 * section de la liste consomment cette même constante. Visible au premier `Scrolled`, invisible
 * EXACTEMENT [LINGER_MS] après le dernier (fenêtre semi-ouverte).
 */
public object ScrollTimePillLaw {

    public const val LINGER_MS: Double = 900.0

    public fun initialState(): ScrollActivityState = ScrollActivityState(lastScrolledAt = null)

    public fun reduce(state: ScrollActivityState, event: ScrollActivityEvent): ScrollActivityState = when (event) {
        is ScrollActivityEvent.Scrolled -> ScrollActivityState(lastScrolledAt = event.at)
        is ScrollActivityEvent.Tick -> state
    }

    public fun isVisible(state: ScrollActivityState, at: Double): Boolean {
        val last = state.lastScrolledAt ?: return false
        return at - last < LINGER_MS
    }
}
