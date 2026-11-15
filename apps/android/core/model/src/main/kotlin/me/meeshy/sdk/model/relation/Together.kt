package me.meeshy.sdk.model.relation

import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.doubleOrNull

/**
 * REGARDER OU ÉCOUTER ENSEMBLE (#17011) — deux Proches lisent la même pièce jointe audio ou vidéo d'une conversation
 * qu'ils partagent, en lecture synchronisée. Le contrat est `packages/shared/types/together.ts` ; ce fichier en est la
 * lecture Kotlin (#17100), miroir de `Relations/Together.swift` du SDK iOS. Le client ne rejuge AUCUNE règle (niveau,
 * conversation commune, média protégé) : la passerelle a jugé, et un refus se dit par son issue, jamais par sa raison.
 */
public object TogetherContract {
    /** `TOGETHER_INVITE_TTL_SECONDS` : comptés ICI depuis la réception, jamais à `expiresAt`. */
    public const val INVITE_TTL_MS: Long = 120_000L

    /** `TOGETHER_MAX_POSITION_MS` : une position au-delà de 24 h n'est pas un média de conversation. */
    public const val MAX_POSITION_MS: Double = 24.0 * 60 * 60 * 1000
}

/** Les noms de fil (`packages/shared/types/socketio-events/together-event-names.ts`). */
public object TogetherEvents {
    public const val INVITE: String = "together:invite"
    public const val JOIN: String = "together:join"
    public const val SYNC: String = "together:sync"
    public const val LEAVE: String = "together:leave"
    public const val INVITED: String = "together:invited"
    public const val STARTED: String = "together:started"
    public const val SYNCED: String = "together:synced"
    public const val ENDED: String = "together:ended"
}

/** Le média lu ensemble. Un genre qu'un serveur plus récent ajouterait ne s'ouvre pas ici. */
public enum class TogetherMediaKind(public val wire: String) {
    AUDIO("audio"),
    VIDEO("video"),
    ;

    public companion object {
        public fun of(wire: String?): TogetherMediaKind? = entries.firstOrNull { it.wire == wire }
    }
}

/** `left` : l'un a quitté (ou la séance a été coupée) · `declined` : l'invité a refusé · `replaced` : remplacée. */
public enum class TogetherEndReason(public val wire: String) {
    LEFT("left"),
    DECLINED("declined"),
    REPLACED("replaced"),
    ;

    public companion object {
        public fun of(wire: String?): TogetherEndReason? = entries.firstOrNull { it.wire == wire }
    }
}

/** L'état de lecture partagé. [at] : horloge du SERVEUR (ms epoch) quand la position valait [positionMs]. */
public data class TogetherPlayback(
    val playing: Boolean,
    val positionMs: Double,
    val at: Double,
    /** Croît à chaque synchronisation : un `rev` déjà appliqué ne rejoue rien. */
    val rev: Int,
    val byUserId: String,
) {
    public companion object {
        public fun read(element: JsonElement?): TogetherPlayback? {
            val o = element as? JsonObject ?: return null
            return TogetherPlayback(
                playing = o.flag("playing") ?: return null,
                positionMs = o.count("positionMs") ?: return null,
                at = o.count("at") ?: return null,
                rev = o.count("rev")?.toInt() ?: return null,
                byUserId = o.text("byUserId") ?: return null,
            )
        }
    }
}

/** `together:invited` — chez l'invité. Aucun nom ne voyage : l'écran l'hydrate par ses caches. */
public data class TogetherInvited(
    val sessionId: String,
    val fromUserId: String,
    val conversationId: String,
    val attachmentId: String,
    val media: TogetherMediaKind,
    val expiresAt: String,
) {
    public companion object {
        public fun read(element: JsonElement?): TogetherInvited? {
            val o = element as? JsonObject ?: return null
            return TogetherInvited(
                sessionId = o.text("sessionId") ?: return null,
                fromUserId = o.text("fromUserId") ?: return null,
                conversationId = o.text("conversationId") ?: return null,
                attachmentId = o.text("attachmentId") ?: return null,
                media = TogetherMediaKind.of(o.text("media")) ?: return null,
                expiresAt = o.text("expiresAt") ?: return null,
            )
        }
    }
}

/** `together:started` — chez l'hôte ET l'invité, tous appareils ; c'est aussi la charge de l'accusé de `join`. */
public data class TogetherStarted(
    val sessionId: String,
    val hostUserId: String,
    val guestUserId: String,
    val conversationId: String,
    val attachmentId: String,
    val media: TogetherMediaKind,
    val playback: TogetherPlayback,
) {
    /** L'autre de la séance vu par [viewerId] : l'invité quand je suis l'hôte, l'hôte sinon ; `null` si je n'en suis pas. */
    public fun partner(viewerId: String): String? = when (viewerId) {
        hostUserId -> guestUserId
        guestUserId -> hostUserId
        else -> null
    }

    public companion object {
        public fun read(element: JsonElement?): TogetherStarted? {
            val o = element as? JsonObject ?: return null
            return TogetherStarted(
                sessionId = o.text("sessionId") ?: return null,
                hostUserId = o.text("hostUserId") ?: return null,
                guestUserId = o.text("guestUserId") ?: return null,
                conversationId = o.text("conversationId") ?: return null,
                attachmentId = o.text("attachmentId") ?: return null,
                media = TogetherMediaKind.of(o.text("media")) ?: return null,
                playback = TogetherPlayback.read(o["playback"]) ?: return null,
            )
        }
    }
}

/** `together:synced` — lecture, pause ou déplacement, horodatés par le serveur. */
public data class TogetherSynced(val sessionId: String, val playback: TogetherPlayback) {
    public companion object {
        public fun read(element: JsonElement?): TogetherSynced? {
            val o = element as? JsonObject ?: return null
            return TogetherSynced(
                sessionId = o.text("sessionId") ?: return null,
                playback = TogetherPlayback.read(o["playback"]) ?: return null,
            )
        }
    }
}

/** `together:ended` — chez les deux. Une raison inconnue rend la charge illisible, comme sur le web et iOS. */
public data class TogetherEnded(val sessionId: String, val reason: TogetherEndReason, val endedAt: String) {
    public companion object {
        public fun read(element: JsonElement?): TogetherEnded? {
            val o = element as? JsonObject ?: return null
            return TogetherEnded(
                sessionId = o.text("sessionId") ?: return null,
                reason = TogetherEndReason.of(o.text("reason")) ?: return null,
                endedAt = o.text("endedAt") ?: return null,
            )
        }
    }
}

/** Ce que l'interface dit d'une invitation. Un refus se dit par son issue, jamais par sa raison. */
public sealed interface TogetherInviteOutcome {
    public data class Invited(val sessionId: String, val media: TogetherMediaKind) : TogetherInviteOutcome
    public data object NotAllowed : TogetherInviteOutcome
    public data object RateLimited : TogetherInviteOutcome
    public data object Offline : TogetherInviteOutcome
    public data object Failed : TogetherInviteOutcome

    public companion object {
        /** [ack] nul ou qui n'est pas un objet = aucun accusé (délai dépassé, « NO ACK ») ⇒ hors ligne. */
        public fun read(ack: JsonElement?): TogetherInviteOutcome {
            val o = ack as? JsonObject ?: return Offline
            if (o.flag("success") == true) {
                val data = o["data"] as? JsonObject ?: return Failed
                val id = data.text("sessionId") ?: return Failed
                val media = TogetherMediaKind.of(data.text("media")) ?: return Failed
                return Invited(id, media)
            }
            return when (o.text("code")) {
                "TOGETHER_NOT_ALLOWED" -> NotAllowed
                "TOGETHER_RATE_LIMITED" -> RateLimited
                else -> Failed
            }
        }
    }
}

/** Ce que l'interface dit d'un « Rejoindre ». [Gone] : l'invitation n'est plus valable, dite sans sa raison. */
public sealed interface TogetherJoinOutcome {
    public data class Joined(val started: TogetherStarted) : TogetherJoinOutcome
    public data object Gone : TogetherJoinOutcome
    public data object Offline : TogetherJoinOutcome
    public data object Failed : TogetherJoinOutcome

    public companion object {
        private val goneCodes = setOf("TOGETHER_NOT_FOUND", "TOGETHER_NOT_ALLOWED")

        public fun read(ack: JsonElement?): TogetherJoinOutcome {
            val o = ack as? JsonObject ?: return Offline
            if (o.flag("success") == true) return TogetherStarted.read(o["data"])?.let(::Joined) ?: Failed
            return if (o.text("code") in goneCodes) Gone else Failed
        }
    }
}

private fun JsonObject.text(key: String): String? =
    (this[key] as? JsonPrimitive)?.takeIf { it.isString }?.content?.takeIf { it.isNotEmpty() }

private fun JsonObject.flag(key: String): Boolean? =
    (this[key] as? JsonPrimitive)?.takeIf { !it.isString }?.booleanOrNull

/** Un nombre négatif, non fini ou servi en texte rend la charge illisible. */
private fun JsonObject.count(key: String): Double? =
    (this[key] as? JsonPrimitive)?.takeIf { !it.isString }?.doubleOrNull?.takeIf { it.isFinite() && it >= 0 }
