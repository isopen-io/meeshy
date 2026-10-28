package me.meeshy.sdk.publication

import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.serialization.encodeToString
import me.meeshy.sdk.media.MediaUploadProgressLedger
import me.meeshy.sdk.media.MediaUploadQueue
import me.meeshy.sdk.model.PostComposerDraftSnapshot
import me.meeshy.sdk.model.UploadedMedia
import me.meeshy.sdk.net.MeeshyApi
import me.meeshy.sdk.net.api.CreatePostRequest
import me.meeshy.sdk.outbox.OutboxDependencyKey
import me.meeshy.sdk.outbox.OutboxIds
import me.meeshy.sdk.outbox.OutboxKind
import me.meeshy.sdk.outbox.OutboxLanes
import me.meeshy.sdk.outbox.OutboxMutation
import me.meeshy.sdk.outbox.OutboxOwnerSource
import me.meeshy.sdk.outbox.OutboxRepository
import me.meeshy.sdk.outbox.OutboxState
import me.meeshy.sdk.outbox.kindEnum
import me.meeshy.sdk.outbox.stateEnum
import me.meeshy.sdk.post.PostComposerDraftStore
import javax.inject.Inject
import javax.inject.Singleton

/**
 * The publications this device holds until the server confirms them (#13417; iOS #13415).
 *
 * A post or a reel is queued here WITH its media: the media still on the device ride as their
 * upload `cmid`s and the post waits on those uploads, and the composer draft is parked under
 * the post's `cmid` instead of being erased. Nothing leaves the device before a 2xx — the
 * `CREATE_POST` delivery releases the draft — or before the author's explicit [discard].
 * [unsent] feeds « Publications non envoyées », where a failed publication is retried, reopened
 * in the composer, or discarded.
 */
@Singleton
public class PublicationOutbox @Inject constructor(
    private val outboxRepository: OutboxRepository,
    private val mediaUploadQueue: MediaUploadQueue,
    private val postDraftStore: PostComposerDraftStore,
    private val progressLedger: MediaUploadProgressLedger,
    private val ownerSource: OutboxOwnerSource,
) {

    /**
     * Queues [request]: it waits on every media of its own still uploading from the device
     * (an exhausted upload is revived — the author is publishing again), and [draft], when
     * given, is parked under the returned `cmid` until the post is confirmed or discarded.
     */
    public suspend fun enqueuePost(request: CreatePostRequest, draft: PostComposerDraftSnapshot? = null): String {
        val cmid = OutboxIds.cmid()
        val uploads = request.mediaIds.orEmpty().filter(OutboxIds::isCmid)
        uploads.filter { outboxRepository.stateOf(it) == OutboxState.EXHAUSTED }
            .forEach { outboxRepository.retry(it) }
        outboxRepository.enqueue(
            OutboxMutation(
                kind = OutboxKind.CREATE_POST,
                lane = OutboxLanes.POST,
                targetId = cmid,
                payload = MeeshyApi.json.encodeToString(request),
                dependsOn = uploads.toSet(),
                cmid = cmid,
            ),
        )
        draft?.let { postDraftStore.park(cmid, it) }
        return cmid
    }

    /**
     * Posts, reels and stories the signed-in account's server has not confirmed, newest first, live —
     * each media with its own fate and, while it leaves, its own bytes in flight (#13429).
     */
    public fun unsent(): Flow<List<UnsentPublication>> =
        combine(outboxRepository.observeAll(), progressLedger.progress) { rows, progress ->
            UnsentPublications.from(rows, ownerSource.currentOwnerId(), progress)
        }.distinctUntilChanged()

    /** A failed publication goes back on its way, the uploads it waits on with it. */
    public suspend fun retry(cmid: String): Boolean = outboxRepository.retryWithPrerequisites(cmid)

    /**
     * The author's explicit removal: the publication, the uploads only it waited on (row and
     * bytes), the likes held on its local id, and its parked draft all leave the device.
     */
    public suspend fun discard(cmid: String) {
        val row = outboxRepository.row(cmid)
        if (row != null) {
            outboxRepository.discard(cmid)
            OutboxDependencyKey.decode(row.dependsOn)
                .filter { outboxRepository.dependentsOf(it).isEmpty() }
                .forEach { mediaUploadQueue.cancel(it) }
            outboxRepository.cancelHeldFor(row.targetId)
        }
        postDraftStore.release(cmid)
    }

    /**
     * « Rouvrir » on a failed post or reel: its draft becomes the composer's editing draft again
     * — with the ids its media have since received — and the failed publication leaves the
     * queue. Its uploads stay: the republish waits on them. `null` (and nothing changed) for a
     * publication that is not a failed post.
     */
    public suspend fun reopenPost(cmid: String): PostComposerDraftSnapshot? {
        val row = outboxRepository.row(cmid) ?: return null
        if (row.kindEnum != OutboxKind.CREATE_POST || row.stateEnum != OutboxState.EXHAUSTED) return null
        val request = runCatching { MeeshyApi.json.decodeFromString(CreatePostRequest.serializer(), row.payload) }
            .getOrNull() ?: return null
        val draft = (postDraftStore.parked(cmid) ?: request.toDraft()).withServedIds(request.mediaIds.orEmpty())
        postDraftStore.saveEditing(draft)
        outboxRepository.discard(cmid)
        postDraftStore.release(cmid)
        return draft
    }

    /** Parked drafts whose publication is no longer queued (confirmed while the app was away) leave. */
    public suspend fun releaseSettledDrafts() {
        postDraftStore.parkedCmids()
            .filter { outboxRepository.stateOf(it) == null }
            .forEach { postDraftStore.release(it) }
    }

    private fun CreatePostRequest.toDraft() = PostComposerDraftSnapshot(
        text = content.orEmpty(),
        visibility = visibility,
        media = mediaIds.orEmpty().map { UploadedMedia(it, "", "", 0L, null, null, null, null) },
        location = location,
        language = originalLanguage,
        mediaAlt = mediaAlt.orEmpty(),
        mediaCaption = mediaCaption.orEmpty(),
    )

    private fun PostComposerDraftSnapshot.withServedIds(ids: List<String>): PostComposerDraftSnapshot {
        if (ids.size != media.size) return this
        val renamed = media.zip(ids).associate { (item, id) -> item.id to id }
        return copy(
            media = media.zip(ids) { item, id -> item.copy(id = id) },
            mediaAlt = mediaAlt.mapKeys { (key, _) -> renamed[key] ?: key },
            mediaCaption = mediaCaption.mapKeys { (key, _) -> renamed[key] ?: key },
        )
    }
}
