package me.meeshy.sdk.model

import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject

/**
 * La ligne d'arrivées regroupées de Meeshy Global (`metadata.kind == "members-arrived"`,
 * #7740) — « Aïcha, Tom et 12 autres viennent d'arriver ». Miroir de
 * `ArrivalsNoticeMetadata` (iOS) et de `parseArrivalsNotice`
 * (`packages/shared/utils/arrivals-notice.ts`).
 */
data class ArrivalsNoticeMetadata(
    /** Les derniers arrivés EN TÊTE : ce sont eux qu'on invite à saluer. */
    val arrivals: List<Arrival>,
    /** Nombre total d'arrivées de la fenêtre, noms gardés ou non (jamais sous `arrivals.size`). */
    val count: Int,
    /** ISO 8601 — l'instant où la ligne a été ouverte. */
    val windowStartedAt: String,
) {
    data class Arrival(val participantId: String, val displayName: String)

    companion object {
        const val KIND = "members-arrived"
        private const val MAX_COUNT = 1_000_000_000.0

        /** VALIDE plutôt que caste : un arrivant malformé est écarté, une ligne sans arrivant est illisible. */
        fun parse(metadata: JsonObject?): ArrivalsNoticeMetadata? {
            if (metadata.text("kind") != KIND) return null
            val array = metadata?.get("arrivals") as? JsonArray ?: return null
            val arrivals = array.mapNotNull { item ->
                val obj = item as? JsonObject ?: return@mapNotNull null
                val id = obj.text("participantId")?.takeIf { it.isNotEmpty() } ?: return@mapNotNull null
                val name = obj.text("displayName")?.takeIf { it.isNotEmpty() } ?: return@mapNotNull null
                Arrival(id, name)
            }
            val rawCount = metadata.number("count") ?: return null
            val windowStartedAt = metadata.text("windowStartedAt") ?: return null
            if (arrivals.isEmpty() || rawCount.isNaN() || rawCount.isInfinite() || kotlin.math.abs(rawCount) >= MAX_COUNT) {
                return null
            }
            return ArrivalsNoticeMetadata(
                arrivals = arrivals,
                count = maxOf(kotlin.math.floor(rawCount).toInt(), arrivals.size),
                windowStartedAt = windowStartedAt,
            )
        }
    }
}
