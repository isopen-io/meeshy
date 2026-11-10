package me.meeshy.sdk.model.relation

import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.doubleOrNull
import me.meeshy.sdk.model.socket.SocketAck

/**
 * ÉMETTRE LE TALKIE (#17150, iso `Relations/TalkieSending.swift` du SDK iOS et `apps/web/src/lib/talkie/talkie-sender.ts`)
 * — la lecture de l'accusé de `talkie:start` et ce que l'interface dit d'une prise de parole qui n'a pas abouti. Le
 * serveur rejuge tout à chaque appui : ces briques ne décident d'aucun droit.
 */

/**
 * Ce que l'interface dit d'une prise de parole qui n'a pas abouti. Un blocage et un repli rendent la MÊME issue
 * ([VOICE]) : l'émetteur ne doit jamais deviner qu'on a coupé SA voix.
 */
public enum class TalkieSendOutcome {
    /** Pas (ou plus) de lien d'au moins Proche : la ligne disparaît, ni grisée ni expliquée. */
    NOT_ALLOWED,
    VOICE,
    E2EE,
    RATE_LIMITED,
    OFFLINE,
    FAILED,
    MIC_DENIED,
    LIMIT,
    ;

    /** Une issue qui n'est pas une erreur : le repli fait partir la voix en message vocal (#17141). */
    public val isInformation: Boolean get() = this == VOICE

    public companion object {
        private val REFUSALS = mapOf(
            "TALKIE_NOT_ALLOWED" to NOT_ALLOWED,
            "TALKIE_BLOCKED" to VOICE,
            "TALKIE_FALLBACK_VOICE" to VOICE,
            "TALKIE_E2EE_CONVERSATION" to E2EE,
            "TALKIE_RATE_LIMITED" to RATE_LIMITED,
        )

        /** Un code que ce client ne connaît pas vaut un échec, jamais une raison inventée. */
        public fun ofRefusal(code: String?): TalkieSendOutcome = code?.let(REFUSALS::get) ?: FAILED
    }
}

/** `live` : la voix sort chez l'autre en direct · `waking` : il est réveillé par un push et la voix lui est rejouée. */
public enum class TalkieDelivery(public val wire: String) {
    LIVE("live"),
    WAKING("waking"),
    ;

    public companion object {
        /** Une absence (ancien serveur) ou une valeur inconnue se lit [LIVE]. */
        public fun of(wire: String?): TalkieDelivery = entries.firstOrNull { it.wire == wire } ?: LIVE
    }
}

/** Une prise de parole OUVERTE par la passerelle, ses bornes ramenées au contrat. */
public data class TalkieOpened(
    val talkieId: String,
    val maxDurationMs: Long = TalkieContract.MAX_DURATION_MS,
    val maxChunkBytes: Int = TalkieContract.MAX_CHUNK_BYTES,
    val delivery: TalkieDelivery = TalkieDelivery.LIVE,
)

/** Le verdict de `talkie:start` : ouverte, refusée avec ce qu'il faut en dire, ou repli nommant sa conversation. */
public sealed interface TalkieStartVerdict {
    public data class Opened(val opened: TalkieOpened) : TalkieStartVerdict

    public data class Refused(val outcome: TalkieSendOutcome) : TalkieStartVerdict

    /** Le repli (`voice`) dont la passerelle nomme la conversation où partira la copie vocale. */
    public data class VoiceInto(val conversationId: String) : TalkieStartVerdict

    public companion object {
        private val OBJECT_ID = Regex("^[0-9a-fA-F]{24}$")

        /** Lit l'accusé ; [ack] porte la charge `data` d'un succès. Totale : rien ne lève. */
        public fun read(ack: SocketAck<JsonObject>): TalkieStartVerdict = when (ack) {
            is SocketAck.Accepted -> ack.payload?.let(::opened) ?: Refused(TalkieSendOutcome.FAILED)
            is SocketAck.Refused -> refused(ack.refusal.code, ack.refusal.conversationId)
            SocketAck.Timeout -> Refused(TalkieSendOutcome.OFFLINE)
        }

        private fun opened(data: JsonObject): TalkieStartVerdict? {
            val talkieId = data.string("talkieId")?.takeIf { it.isNotEmpty() } ?: return null
            val opened = TalkieOpened(
                talkieId = talkieId,
                maxDurationMs = bounded(data.number("maxDurationMs"), TalkieContract.MAX_DURATION_MS.toDouble()).toLong(),
                maxChunkBytes = bounded(data.number("maxChunkBytes"), TalkieContract.MAX_CHUNK_BYTES.toDouble()).toInt(),
                delivery = TalkieDelivery.of(data.string("delivery")),
            )
            return Opened(opened)
        }

        private fun refused(code: String?, conversationId: String?): TalkieStartVerdict {
            val outcome = TalkieSendOutcome.ofRefusal(code)
            if (outcome != TalkieSendOutcome.VOICE || conversationId == null || !OBJECT_ID.matches(conversationId)) {
                return Refused(outcome)
            }
            return VoiceInto(conversationId)
        }

        /** Une borne servie absente, nulle, négative ou plus large que le contrat est ramenée au contrat. */
        private fun bounded(served: Double?, ceiling: Double): Double {
            if (served == null || !served.isFinite() || served <= 0) return ceiling
            return minOf(served, ceiling)
        }

        private fun JsonObject.string(key: String): String? =
            (this[key] as? JsonPrimitive)?.takeIf { it.isString }?.contentOrNull

        private fun JsonObject.number(key: String): Double? =
            (this[key] as? JsonPrimitive)?.takeIf { !it.isString }?.doubleOrNull
    }
}
