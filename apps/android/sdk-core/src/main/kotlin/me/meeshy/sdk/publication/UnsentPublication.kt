package me.meeshy.sdk.publication

import kotlinx.serialization.json.Json
import me.meeshy.core.database.entity.OutboxEntity
import me.meeshy.sdk.media.MediaLocationRefusal
import me.meeshy.sdk.media.MediaUploadSender
import me.meeshy.sdk.model.StoryComposerDraftSnapshot
import me.meeshy.sdk.model.media.MediaFate
import me.meeshy.sdk.model.media.MediaUploadProgress
import me.meeshy.sdk.net.MeeshyApi
import me.meeshy.sdk.net.api.CreatePostRequest
import me.meeshy.sdk.net.api.CreateStoryRequest
import me.meeshy.sdk.outbox.OutboxIds
import me.meeshy.sdk.outbox.OutboxKind
import me.meeshy.sdk.outbox.OutboxState
import me.meeshy.sdk.outbox.kindEnum
import me.meeshy.sdk.outbox.stateEnum
import me.meeshy.sdk.model.net.OnlyUnlinkedRefusal

public enum class UnsentPublicationKind { POST, REEL, STORY }

public enum class UnsentPublicationStatus { SENDING, FAILED }

/** One media of an unsent publication: where it stands, and how far it got if it is leaving now. */
public data class UnsentMedia(val id: String, val fate: MediaFate, val progress: MediaUploadProgress)

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
    val media: List<UnsentMedia> = emptyList(),
    /** Whether the composer draft this publication was made from is still on the device — a story reopens only from it. */
    val draftKept: Boolean = true,
) {
    /** Le refus du plafond des choisis sans lien qui a arrêté cette publication, à dire à l'auteur (#14169). */
    val onlyUnlinkedRefusal: OnlyUnlinkedRefusal? get() = OnlyUnlinkedRefusal.parse(failureReason)

    /** A failed post or reel reopens in the composer; so does a failed story whose draft is still kept (#13500). */
    val canReopen: Boolean get() = status == UnsentPublicationStatus.FAILED && (kind != UnsentPublicationKind.STORY || draftKept)

    /** Only a publication that gave up is retried by hand: one on its way retries on its own. */
    val canRetry: Boolean get() = status == UnsentPublicationStatus.FAILED
}

/**
 * Reads the unsent publications out of the outbox rows — newest first, undecodable rows skipped.
 *
 * Only [ownerId]'s rows are read: the outbox keeps an account's rows on the device when another account
 * signs in (they leave when it comes back), so listing them all would show A's unsent text to B.
 */
public object UnsentPublications {

    public fun from(
        rows: List<OutboxEntity>,
        ownerId: String?,
        progress: Map<String, MediaUploadProgress>,
        json: Json = MeeshyApi.json,
        storyDraft: StoryComposerDraftSnapshot? = null,
    ): List<UnsentPublication> {
        if (ownerId == null) return emptyList()
        val uploads = rows.associateBy { it.cmid }
        val reopenableStories = reopenableStories(storyDraft, uploads)
        return rows.filter { it.ownerId == ownerId }
            .mapNotNull { it.toUnsent(json, uploads, progress) }
            .map { if (it.kind == UnsentPublicationKind.STORY) it.copy(draftKept = it.cmid in reopenableStories) else it }
            .sortedByDescending { it.createdAtMillis }
    }

    /**
     * The story rows a kept draft can be reopened from (#13500): the draft awaits them, and every one of them is
     * still on the device and gave up. A draft one of whose stories already left, or is still on its way, would
     * publish that slide twice — it is retried or discarded, never reopened.
     */
    fun reopenableStories(draft: StoryComposerDraftSnapshot?, rows: Map<String, OutboxEntity>): Set<String> {
        val awaited = draft?.takeIf { it.isWorthRestoring }?.awaitingPublication.orEmpty()
        val allGaveUp = awaited.isNotEmpty() && awaited.all { rows[it]?.stateEnum == OutboxState.EXHAUSTED }
        return if (allGaveUp) awaited.toSet() else emptySet()
    }

    private fun OutboxEntity.toUnsent(
        json: Json,
        uploads: Map<String, OutboxEntity>,
        progress: Map<String, MediaUploadProgress>,
    ): UnsentPublication? = when (kindEnum) {
        OutboxKind.CREATE_POST -> runCatching { json.decodeFromString(CreatePostRequest.serializer(), payload) }
            .getOrNull()
            ?.let { request ->
                unsent(
                    kind = if (request.type == REEL) UnsentPublicationKind.REEL else UnsentPublicationKind.POST,
                    text = request.content,
                    mediaIds = request.mediaIds.orEmpty(),
                    uploads = uploads,
                    progress = progress,
                )
            }
        OutboxKind.PUBLISH_STORY -> runCatching { json.decodeFromString(CreateStoryRequest.serializer(), payload) }
            .getOrNull()
            ?.let { request -> unsent(UnsentPublicationKind.STORY, request.content, request.mediaIds.orEmpty(), uploads, progress) }
        else -> null
    }

    private fun OutboxEntity.unsent(
        kind: UnsentPublicationKind,
        text: String?,
        mediaIds: List<String>,
        uploads: Map<String, OutboxEntity>,
        progress: Map<String, MediaUploadProgress>,
    ) = UnsentPublication(
        cmid = cmid,
        kind = kind,
        text = text?.takeIf { it.isNotBlank() },
        mediaCount = mediaIds.size,
        status = if (stateEnum == OutboxState.EXHAUSTED) UnsentPublicationStatus.FAILED else UnsentPublicationStatus.SENDING,
        createdAtMillis = createdAt,
        failureReason = lastError,
        media = mediaIds.map { it.toUnsentMedia(uploads, progress) },
    )

    /** A server id is on the gateway; a `cmid` is a queued upload, refused, or gone with its bytes. */
    private fun String.toUnsentMedia(uploads: Map<String, OutboxEntity>, progress: Map<String, MediaUploadProgress>): UnsentMedia {
        if (!OutboxIds.isCmid(this)) return UnsentMedia(this, MediaFate.UPLOADED, MediaUploadProgress.Ready(this))
        val upload = uploads[this]
        val fate = when {
            upload == null -> MediaFate.LOST
            upload.stateEnum != OutboxState.EXHAUSTED -> MediaFate.WAITING
            upload.lastError == MediaUploadSender.REASON_BLOB_GONE -> MediaFate.LOST
            MediaLocationRefusal.isReason(upload.lastError) -> MediaFate.LOCATION_REFUSED
            else -> MediaFate.REFUSED
        }
        return UnsentMedia(this, fate, progress[this] ?: MediaUploadProgress.Idle)
    }

    private const val REEL = "REEL"
}
