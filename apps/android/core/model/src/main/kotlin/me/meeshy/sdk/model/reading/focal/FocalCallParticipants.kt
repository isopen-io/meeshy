package me.meeshy.sdk.model.reading.focal

import me.meeshy.sdk.model.CallSummaryMetadata

/**
 * A1.2 — la ligne des participants sous le titre de la carte d'appel (« Awa, Karim, Lina et vous »), loi pure miroir
 * de `CallSummaryMetadata.participantsLine` (iOS). Le message est le même pour tous ses lecteurs : la ligne se résout
 * chez le lecteur, qui s'en retire — jamais son propre nom, mais « vous » en dernier s'il a pris part à l'appel. La
 * jointure par la conjonction de la langue (ICU `ListFormatter`) est celle de l'écran : cette loi ne livre que l'ordre.
 */
object FocalCallParticipants {

    /** Les noms des AUTRES, rognés et non vides, dans l'ordre servi ; [viewerTookPart] ajoute « vous » à la fin. */
    data class Roster(val others: List<String>, val viewerTookPart: Boolean) {
        fun names(youLabel: String): List<String> = if (viewerTookPart) others + youLabel else others
    }

    /** `null` quand la passerelle n'a servi aucun autre nom : la carte n'invente alors aucune ligne. */
    fun of(summary: CallSummaryMetadata, viewerId: String): Roster? {
        val served = summary.participants.orEmpty()
        val others = served
            .filter { it.userId != viewerId }
            .map { it.displayName.trim() }
            .filter { it.isNotEmpty() }
        if (others.isEmpty()) return null
        return Roster(others = others, viewerTookPart = viewerId.isNotEmpty() && served.any { it.userId == viewerId })
    }
}
