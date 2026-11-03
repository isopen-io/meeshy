package me.meeshy.app.chat

import androidx.compose.runtime.Stable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import java.time.ZoneId
import java.util.Locale
import me.meeshy.sdk.model.reading.focal.ScrollActivityEvent
import me.meeshy.sdk.model.reading.focal.ScrollActivityState
import me.meeshy.sdk.model.reading.focal.ScrollTimePillLaw

/**
 * L'état de la pilule « jour · heure » du fil (iOS `ScrollTimePillState`) : il pilote la loi gelée
 * [ScrollTimePillLaw]. Les horodatages sont des MILLISECONDES injectées par l'appelant, jamais
 * d'horloge ici. La visibilité est celle de la loi, retirée quand l'en-tête est déployé ; la garde
 * d'égalité évite une publication par image de défilement.
 */
@Stable
internal class ScrollTimePillState {
    var label: String? by mutableStateOf(null)
        private set
    var isVisible: Boolean by mutableStateOf(false)
        private set
    var isHeaderExpanded: Boolean = false
        set(value) {
            field = value
            recomputeVisibility()
        }

    private var lawState: ScrollActivityState = ScrollTimePillLaw.initialState()
    private var lastKnownAt: Double = 0.0

    /** Un `Tick` ne change jamais le libellé : seul `Scrolled` connaît le message survolé. */
    fun note(event: ScrollActivityEvent, label: String? = null) {
        lawState = ScrollTimePillLaw.reduce(lawState, event)
        when (event) {
            is ScrollActivityEvent.Scrolled -> {
                lastKnownAt = event.at
                if (label != null && label != this.label) this.label = label
            }
            is ScrollActivityEvent.Tick -> lastKnownAt = event.at
        }
        recomputeVisibility()
    }

    private fun recomputeVisibility() {
        val next = !isHeaderExpanded && ScrollTimePillLaw.isVisible(lawState, lastKnownAt)
        if (next != isVisible) isVisible = next
    }
}

/**
 * La révélation de l'heure et des coches des rangées plates (iOS `FocalTimestampRevealState`) :
 * la MÊME loi et la MÊME constante que la pilule, un booléen au lieu d'une capsule.
 */
@Stable
internal class FocalTimestampRevealState {
    var isRevealed: Boolean by mutableStateOf(false)
        private set

    private var lawState: ScrollActivityState = ScrollTimePillLaw.initialState()
    private var lastKnownAt: Double = 0.0

    fun note(event: ScrollActivityEvent) {
        lawState = ScrollTimePillLaw.reduce(lawState, event)
        lastKnownAt = when (event) {
            is ScrollActivityEvent.Scrolled -> event.at
            is ScrollActivityEvent.Tick -> event.at
        }
        val next = ScrollTimePillLaw.isVisible(lawState, lastKnownAt)
        if (next != isRevealed) isRevealed = next
    }
}

/** Le libellé « Aujourd'hui · 14:32 » : le jour via [MessageDayLabel], l'heure déjà formatée par l'appelant. */
internal object ScrollTimePillLabel {
    fun of(
        messageMillis: Long,
        timeString: String,
        nowMillis: Long,
        zone: ZoneId,
        locale: Locale,
        today: String,
        yesterday: String,
        dayBeforeYesterday: String,
    ): String {
        val day = MessageDayLabel.label(messageMillis, nowMillis, zone, locale, today, yesterday, dayBeforeYesterday)
        return "$day · $timeString"
    }

    /** Une rangée visible, en coordonnées d'écran (haut vers le bas). */
    data class Row(val isMessage: Boolean, val minY: Float, val maxY: Float)

    /**
     * L'indice, dans [rows], du message survolé : le plus haut dont le bas dépasse la [readingLine]
     * et qui reste au-dessus de [viewportBottom]. Les séparateurs ne se survolent pas.
     */
    fun hoveredRow(rows: List<Row>, readingLine: Float, viewportBottom: Float): Int? =
        rows.indices
            .filter { rows[it].isMessage && rows[it].maxY > readingLine && rows[it].minY < viewportBottom }
            .minByOrNull { rows[it].minY }
}
