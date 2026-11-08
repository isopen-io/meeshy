package me.meeshy.sdk.model.share

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.int
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import me.meeshy.sdk.model.ClientIdFormat

/**
 * **La fiche de reprise d'un partage** — miroir de `SharePendingShare` (extension iOS).
 *
 * Deux invariants : elle est réécrite ATOMIQUEMENT à chaque transition (fichiers copiés, envoi terminé,
 * cible servie), et elle n'est supprimée que lorsque TOUTES les cibles sont servies — jamais après la
 * première, qui perdrait les suivantes sans trace. Chaque cible porte son PROPRE `clientMessageId`, généré
 * une fois et persisté : la passerelle ne dédoublonne que sur `(conversationId, clientMessageId)`.
 */
@Serializable
enum class TargetState {
    @SerialName("pending") PENDING,
    @SerialName("sent") SENT,
    @SerialName("failed") FAILED,
}

@Serializable
data class SharePendingTarget(
    val conversationId: String,
    val clientMessageId: String,
    val state: TargetState = TargetState.PENDING,
    val serverMessageId: String? = null,
)

@Serializable
data class SharePendingMedia(
    val relPath: String,
    val ext: String,
    val mime: String,
    val bytes: Long,
    val originalName: String? = null,
) {
    fun toStaged(): ShareStagedMedia = ShareStagedMedia(relPath, ext, mime, bytes, originalName)

    companion object {
        fun of(media: ShareStagedMedia): SharePendingMedia =
            SharePendingMedia(media.relPath, media.ext, media.mime, media.bytes, media.originalName)
    }
}

@Serializable
data class SharePendingShare(
    val v: Int = CURRENT_VERSION,
    val clientMessageId: String,
    val createdAt: Long,
    /** Le compte déposant ; `null` pour le relais d'un partage déposé sans session (servi à tout compte). */
    val ownerUserId: String? = null,
    val content: String? = null,
    val media: List<SharePendingMedia> = emptyList(),
    /** Écrit APRÈS un envoi réussi des fichiers : sa présence dispense toute cible de les renvoyer. */
    val uploadedAttachmentIds: List<String>? = null,
    val targets: List<SharePendingTarget>,
    /** La cible qui porte les octets ; `null` sans média. */
    val originTargetIndex: Int? = null,
) {
    val isFullyServed: Boolean get() = targets.all { it.state == TargetState.SENT }

    val remainingTargets: List<SharePendingTarget> get() = targets.filter { it.state != TargetState.SENT }

    val needsUpload: Boolean get() = media.isNotEmpty() && uploadedAttachmentIds == null

    val fileName: String get() = fileName(clientMessageId)

    fun withUploadedAttachments(ids: List<String>): SharePendingShare = copy(uploadedAttachmentIds = ids)

    fun markSent(conversationId: String, serverMessageId: String?): SharePendingShare =
        updateTarget(conversationId) { it.copy(state = TargetState.SENT, serverMessageId = serverMessageId ?: it.serverMessageId) }

    /** Une cible déjà servie ne redevient jamais « échouée ». */
    fun markFailed(conversationId: String): SharePendingShare =
        updateTarget(conversationId) { if (it.state == TargetState.SENT) it else it.copy(state = TargetState.FAILED) }

    /** Une cible refusée pour de bon quitte la fiche ; si c'était l'origine, la première cible gardée porte désormais les octets. */
    fun withoutTarget(conversationId: String): SharePendingShare {
        val removed = targets.indexOfFirst { it.conversationId == conversationId }
        if (removed < 0) return this
        val kept = targets.filterIndexed { index, _ -> index != removed }
        val origin = originTargetIndex
        val nextOrigin = when {
            origin == null || kept.isEmpty() -> null
            origin == removed -> 0
            origin > removed -> origin - 1
            else -> origin
        }
        return copy(targets = kept, originTargetIndex = nextOrigin)
    }

    fun isServedTo(accountId: String?): Boolean = ownerUserId == null || ownerUserId == accountId

    fun isExpired(nowEpochMillis: Long): Boolean = nowEpochMillis - createdAt >= EXPIRY_MILLIS

    private fun updateTarget(conversationId: String, transform: (SharePendingTarget) -> SharePendingTarget): SharePendingShare =
        copy(targets = targets.map { if (it.conversationId == conversationId) transform(it) else it })

    companion object {
        const val CURRENT_VERSION: Int = 1
        const val EXPIRY_MILLIS: Long = 7L * 24 * 60 * 60 * 1000

        fun fileName(shareId: String): String = "$shareId.json"

        fun make(
            shareId: String,
            createdAt: Long,
            ownerUserId: String?,
            content: String?,
            media: List<ShareStagedMedia>,
            conversationIds: List<String>,
            newClientMessageId: () -> String = ClientIdFormat::newCid,
        ): SharePendingShare = SharePendingShare(
            clientMessageId = shareId,
            createdAt = createdAt,
            ownerUserId = ownerUserId,
            content = content,
            media = media.map(SharePendingMedia::of),
            targets = conversationIds.map { SharePendingTarget(it, newClientMessageId()) },
            originTargetIndex = if (media.isEmpty()) null else 0,
        )
    }
}

object SharePendingShareCodec {
    private val json = Json { ignoreUnknownKeys = true; encodeDefaults = true }

    sealed interface Decoded {
        data class Readable(val share: SharePendingShare) : Decoded
        data class UnknownVersion(val version: Int) : Decoded
        data object Corrupt : Decoded
    }

    fun encode(share: SharePendingShare): String = json.encodeToString(SharePendingShare.serializer(), share)

    fun decode(text: String): Decoded {
        val version = runCatching { json.parseToJsonElement(text).jsonObject.version() }.getOrNull() ?: return Decoded.Corrupt
        if (version != SharePendingShare.CURRENT_VERSION) return Decoded.UnknownVersion(version)
        return runCatching { json.decodeFromString(SharePendingShare.serializer(), text) }
            .fold({ Decoded.Readable(it) }, { Decoded.Corrupt })
    }

    private fun JsonObject.version(): Int? = this["v"]?.jsonPrimitive?.int
}
