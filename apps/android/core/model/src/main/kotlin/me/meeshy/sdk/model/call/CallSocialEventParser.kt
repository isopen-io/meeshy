package me.meeshy.sdk.model.call

import java.time.Instant
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.intOrNull

/**
 * Décodage tolérant des événements sociaux d'un appel. Un JSON malformé, un champ
 * requis manquant ou vide rend `null` : l'événement est ignoré, jamais un crash.
 * Les clés inconnues sont ignorées (une passerelle plus récente ajoute des champs).
 */
object CallSocialEventParser {
    private val json = Json { ignoreUnknownKeys = true; isLenient = true }

    private fun obj(raw: String): JsonObject? =
        runCatching { json.parseToJsonElement(raw) as? JsonObject }.getOrNull()

    private fun JsonObject.str(key: String): String? =
        (this[key] as? JsonPrimitive)?.takeIf { it.isString }?.contentOrNull?.takeIf { it.isNotBlank() }

    private fun JsonObject.bool(key: String): Boolean? = (this[key] as? JsonPrimitive)?.booleanOrNull

    private fun JsonObject.child(key: String): JsonObject? = this[key] as? JsonObject

    private fun JsonElement?.isAbsent(): Boolean = this == null || this is JsonNull

    private inline fun <T> decode(raw: String, build: (JsonObject) -> T?): T? =
        runCatching { obj(raw)?.let(build) }.getOrNull()

    fun participantInvited(raw: String): CallParticipantInvited? = decode(raw) { o ->
        val invitee = o.child("invitee") ?: return@decode null
        CallParticipantInvited(
            callId = o.str("callId") ?: return@decode null,
            invitedBy = o.str("invitedBy") ?: return@decode null,
            invitee = CallInvitedUser(
                userId = invitee.str("userId") ?: return@decode null,
                username = invitee.str("username") ?: "",
                displayName = invitee.str("displayName"),
                avatar = invitee.str("avatar"),
            ),
            participantCount = (o["participantCount"] as? JsonPrimitive)?.intOrNull ?: 0,
        )
    }

    fun inviteSettled(raw: String, outcome: CallInviteOutcome): CallInviteSettled? = decode(raw) { o ->
        CallInviteSettled(
            callId = o.str("callId") ?: return@decode null,
            userId = o.str("userId") ?: return@decode null,
            outcome = outcome,
        )
    }

    fun mutedByModerator(raw: String): CallMutedByModerator? = decode(raw) { o ->
        CallMutedByModerator(
            callId = o.str("callId") ?: return@decode null,
            byUserId = o.str("byUserId") ?: return@decode null,
        )
    }

    /** Un emoji hors de la liste fermée est ignoré à la frontière. */
    fun reactionReceived(raw: String): CallReactionReceived? = decode(raw) { o ->
        CallReactionReceived(
            callId = o.str("callId") ?: return@decode null,
            userId = o.str("userId") ?: return@decode null,
            emoji = CallReactionEmoji.fromGlyph(o.str("emoji")) ?: return@decode null,
        )
    }

    fun transcriptionActive(raw: String): CallTranscriptionActive? = decode(raw) { o ->
        CallTranscriptionActive(
            callId = o.str("callId") ?: return@decode null,
            speakerId = o.str("speakerId") ?: return@decode null,
            active = o.bool("active") ?: return@decode null,
        )
    }

    fun previewRequested(raw: String): CallPreviewRequested? = decode(raw) { o ->
        CallPreviewRequested(
            callId = o.str("callId") ?: return@decode null,
            userId = o.str("userId") ?: return@decode null,
        )
    }

    fun recordingRequested(raw: String): CallRecordingRequested? = decode(raw) { o ->
        CallRecordingRequested(
            callId = o.str("callId") ?: return@decode null,
            recordingId = o.str("recordingId") ?: return@decode null,
            requesterId = o.str("requesterId") ?: return@decode null,
            requiredUserIds = (o["requiredUserIds"] as? JsonArray ?: return@decode null)
                .mapNotNull { (it as? JsonPrimitive)?.takeIf { p -> p.isString }?.contentOrNull },
            kind = CallRecordingKind.fromWire(o.str("kind")),
            expiresAtMillis = o.str("expiresAt")?.let { runCatching { Instant.parse(it).toEpochMilli() }.getOrNull() },
        )
    }

    fun recordingStarted(raw: String): CallRecordingStarted? = decode(raw) { o ->
        CallRecordingStarted(
            callId = o.str("callId") ?: return@decode null,
            recordingId = o.str("recordingId") ?: return@decode null,
            recorderId = o.str("recorderId") ?: return@decode null,
            kind = CallRecordingKind.fromWire(o.str("kind")),
        )
    }

    fun recordingStopped(raw: String): CallRecordingStopped? = decode(raw) { o ->
        CallRecordingStopped(
            callId = o.str("callId") ?: return@decode null,
            recordingId = o.str("recordingId") ?: return@decode null,
            reason = o.str("reason") ?: return@decode null,
            byUserId = o.str("byUserId"),
            wasRecording = o.bool("wasRecording") ?: false,
        )
    }

    /** `frameId` doit être PRÉSENT (chaîne, ou `null` explicite = retrait) ; une réponse inconnue se lit absente. */
    fun frameSelected(raw: String): CallLiveFrameSelected? = decode(raw) { o ->
        if (!o.containsKey("frameId")) return@decode null
        val texts = o.child("texts")?.let { CallLiveFrameTexts(name = it.str("name"), city = it.str("city")) }
        CallLiveFrameSelected(
            callId = o.str("callId") ?: return@decode null,
            userId = o.str("userId") ?: return@decode null,
            frameId = if (o["frameId"].isAbsent()) null else (o.str("frameId") ?: return@decode null),
            texts = texts,
            reply = CallLiveFrameReply.fromWire(o.str("reply")),
        )
    }

    /** `call:preview-signal` a la forme de `call:signal`. */
    fun previewSignal(raw: String): CallSignalEnvelope? = CallSignalMapper.signalEnvelope(raw)
}
