package me.meeshy.sdk.model

import kotlinx.serialization.json.JsonObject
import java.util.Locale

/**
 * Faits structurés d'un appel terminé (ou en cours), portés par `metadata` d'un message
 * système d'appel — miroir de `CallSummaryMetadata` (iOS) et de
 * `packages/shared/utils/call-summary.ts`. Le sens (direction, glyphe, teinte, ligne
 * « durée · données · qualité ») se résout chez le lecteur, sans re-lire l'appel.
 */
data class CallSummaryMetadata(
    val callId: String,
    /** Identifiant de l'initiateur : comparé à l'utilisateur courant, il dit sortant ou entrant. */
    val initiatorId: String,
    val callType: MediaType,
    val outcome: Outcome,
    val durationSeconds: Int,
    /** Octets échangés, ou `null` quand rien n'a été mesuré (appel manqué ou refusé). */
    val bytesTotal: Int?,
    /** `true` quand [bytesTotal] est ESTIMÉ à partir de la durée plutôt que mesuré. */
    val bytesEstimated: Boolean,
    val networkQuality: NetworkQuality?,
    /** Appel EN COURS (`kind: "call-live"`) : son [outcome] n'est qu'un substitut neutre — lire [isLive] d'abord. */
    val isLive: Boolean = false,
    /** `true` seulement sur un appel manqué, jamais décroché, terminé par son initiateur. */
    val endedByInitiator: Boolean? = null,
) {
    enum class MediaType(val wireName: String) { AUDIO("audio"), VIDEO("video") }

    enum class Outcome(val wireName: String) {
        COMPLETED("completed"),
        MISSED("missed"),
        REJECTED("rejected"),
        FAILED("failed"),
    }

    /** Ordonnée du pire au meilleur. */
    enum class NetworkQuality(val wireName: String) {
        POOR("poor"),
        FAIR("fair"),
        GOOD("good"),
        EXCELLENT("excellent"),
    }

    fun isOutgoing(currentUserId: String): Boolean = currentUserId.isNotEmpty() && initiatorId == currentUserId

    /** « Appel annulé » : seulement dans la vue de l'initiateur. */
    fun isCancelled(viewerIsInitiator: Boolean): Boolean =
        viewerIsInitiator && outcome == Outcome.MISSED && endedByInitiator == true

    val durationLabel: String get() = formatDuration(durationSeconds)

    /** Données dépensées, préfixées de « ~ » quand estimées ; `null` quand rien à dire. */
    val dataSpentLabel: String?
        get() {
            val bytes = bytesTotal?.takeIf { it > 0 } ?: return null
            val size = formatDataSize(bytes)
            return if (bytesEstimated) "~$size" else size
        }

    companion object {
        const val KIND = "call"
        const val KIND_LIVE = "call-live"
        private const val KIND_ALIAS = "call-summary"

        /** Ne décode que `call` / `call-live` : toute autre famille de `metadata` est ignorée sans erreur. */
        fun parse(metadata: JsonObject?): CallSummaryMetadata? {
            val kind = metadata.text("kind")
            val live = kind == KIND_LIVE
            if (!live && kind != KIND && kind != KIND_ALIAS) return null
            val callId = metadata.text("callId") ?: return null
            val initiatorId = metadata.text("initiatorId") ?: return null
            val callType = MediaType.entries.firstOrNull { it.wireName == metadata.text("callType") } ?: return null
            val outcome = Outcome.entries.firstOrNull { it.wireName == metadata.text("outcome") }
                ?: if (live) Outcome.COMPLETED else return null
            return CallSummaryMetadata(
                callId = callId,
                initiatorId = initiatorId,
                callType = callType,
                outcome = outcome,
                durationSeconds = metadata.number("durationSeconds")?.toInt() ?: 0,
                bytesTotal = metadata.number("bytesTotal")?.toInt(),
                bytesEstimated = metadata.flag("bytesEstimated") ?: false,
                networkQuality = NetworkQuality.entries.firstOrNull { it.wireName == metadata.text("networkQuality") },
                isLive = live,
                endedByInitiator = metadata.flag("endedByInitiator"),
            )
        }

        /** « MM:SS » (ou « H:MM:SS » au-delà d'une heure) — miroir de `formatCallDuration`. */
        fun formatDuration(seconds: Int): String {
            val total = maxOf(0, seconds)
            val hours = total / 3600
            val minutes = (total % 3600) / 60
            val secs = total % 60
            fun pad(v: Int) = if (v < 10) "0$v" else "$v"
            return if (hours > 0) "$hours:${pad(minutes)}:${pad(secs)}" else "${pad(minutes)}:${pad(secs)}"
        }

        /** Unités décimales (1 KB = 1000 o) — miroir de `formatCallDataSize`. */
        fun formatDataSize(bytes: Int): String {
            if (bytes <= 0) return "0 KB"
            val kb = bytes / 1000.0
            if (kb < 1) return "1 KB"
            if (Math.round(kb) < 1000) return "${Math.round(kb)} KB"
            val mb = bytes / 1_000_000.0
            if (roundTenth(mb) < 1000) return "${decimal(mb)} MB"
            return "${decimal(bytes / 1_000_000_000.0)} GB"
        }

        private fun roundTenth(value: Double): Double = Math.round(value * 10) / 10.0

        private fun decimal(value: Double): String {
            val rounded = roundTenth(value)
            return if (rounded == Math.floor(rounded)) rounded.toInt().toString() else String.format(Locale.ROOT, "%.1f", rounded)
        }
    }
}
