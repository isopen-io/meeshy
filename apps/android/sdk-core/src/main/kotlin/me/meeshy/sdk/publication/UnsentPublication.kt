package me.meeshy.sdk.publication

import kotlinx.serialization.json.Json
import me.meeshy.core.database.entity.OutboxEntity
import me.meeshy.sdk.net.MeeshyApi
import me.meeshy.sdk.net.api.CreatePostRequest
import me.meeshy.sdk.net.api.CreateStoryRequest
import me.meeshy.sdk.outbox.OutboxKind
import me.meeshy.sdk.outbox.OutboxState
import me.meeshy.sdk.outbox.kindEnum
import me.meeshy.sdk.outbox.stateEnum

public enum class UnsentPublicationKind { POST, REEL, STORY }

public enum class UnsentPublicationStatus { SENDING, FAILED }

/**
 * One publication the device holds and the server has not confirmed (#13417) — a post, a reel
 * or a story still on its way, or one that gave up and waits for the author. The row it is
 * read from stays in the outbox until the server answers 2xx or the author discards it.
 */
public data class UnsentPublication(
    val cmid: String,
    val kind: UnsentPublicationKind,
    val text: String?,
    val mediaCount: Int,
    val status: UnsentPublicationStatus,
    val createdAtMillis: Long,
    val failureReason: String?,
) {
    /** A failed post or reel reopens in the composer; a story is retried or discarded. */
    val canReopen: Boolean get() = status == UnsentPublicationStatus.FAILED && kind != UnsentPublicationKind.STORY

    /** Only a publication that gave up is retried by hand: one on its way retries on its own. */
    val canRetry: Boolean get() = status == UnsentPublicationStatus.FAILED
}

/** Reads the unsent publications out of the outbox rows — newest first, undecodable rows skipped. */
public object UnsentPublications {

    public fun from(rows: List<OutboxEntity>, json: Json = MeeshyApi.json): List<UnsentPublication> =
        rows.mapNotNull { it.toUnsent(json) }.sortedByDescending { it.createdAtMillis }

    private fun OutboxEntity.toUnsent(json: Json): UnsentPublication? = when (kindEnum) {
        OutboxKind.CREATE_POST -> runCatching { json.decodeFromString(CreatePostRequest.serializer(), payload) }
            .getOrNull()
            ?.let { request ->
                unsent(
                    kind = if (request.type == REEL) UnsentPublicationKind.REEL else UnsentPublicationKind.POST,
                    text = request.content,
                    mediaCount = request.mediaIds.orEmpty().size,
                )
            }
        OutboxKind.PUBLISH_STORY -> runCatching { json.decodeFromString(CreateStoryRequest.serializer(), payload) }
            .getOrNull()
            ?.let { request -> unsent(UnsentPublicationKind.STORY, request.content, request.mediaIds.orEmpty().size) }
        else -> null
    }

    private fun OutboxEntity.unsent(kind: UnsentPublicationKind, text: String?, mediaCount: Int) = UnsentPublication(
        cmid = cmid,
        kind = kind,
        text = text?.takeIf { it.isNotBlank() },
        mediaCount = mediaCount,
        status = if (stateEnum == OutboxState.EXHAUSTED) UnsentPublicationStatus.FAILED else UnsentPublicationStatus.SENDING,
        createdAtMillis = createdAt,
        failureReason = lastError,
    )

    private const val REEL = "REEL"
}
