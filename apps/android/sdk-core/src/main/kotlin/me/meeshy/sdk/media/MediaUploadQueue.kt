package me.meeshy.sdk.media

import me.meeshy.sdk.outbox.OutboxIds
import me.meeshy.sdk.outbox.OutboxKind
import me.meeshy.sdk.outbox.OutboxLanes
import me.meeshy.sdk.outbox.OutboxMutation
import me.meeshy.sdk.outbox.OutboxRepository
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Durably enqueues a media upload (ARCHITECTURE.md §5; ADR-006) — the enqueue half
 * of the producer side of the upload→publish chain.
 *
 * The bytes are written to the durable [MediaBlobStore] **first**, then an
 * `UPLOAD_MEDIA` row is enqueued on the dedicated [OutboxLanes.MEDIA] lane. Both
 * are keyed by the **same** `cmid`, which is also returned: a caller (the story
 * composer) enqueues a publish that `dependsOn` this cmid and carries it as the
 * placeholder media id, so once the upload delivers a real id the drainer grafts
 * it into the waiting publish. Writing the blob before the row guarantees a queued
 * upload always has its bytes — the row never exists without them.
 *
 * A stateless building block: it persists exactly what the `MEDIA`-lane sender
 * consumes and decides nothing about *when* an upload should be queued (that is the
 * composer's product rule). Surpasses iOS, which uploads synchronously and cannot
 * queue a media attachment while offline.
 */
@Singleton
class MediaUploadQueue @Inject constructor(
    private val blobStore: MediaBlobStore,
    private val outboxRepository: OutboxRepository,
) {
    /**
     * Durably queues [item] for upload. Returns the `cmid` shared by the stored
     * blob and the outbox row — the dependency key a dependent publish references.
     */
    suspend fun enqueue(item: MediaUploadItem): String {
        val cmid = OutboxIds.cmid()
        blobStore.put(cmid, item)
        outboxRepository.enqueue(
            OutboxMutation(
                kind = OutboxKind.UPLOAD_MEDIA,
                lane = OutboxLanes.MEDIA,
                targetId = cmid,
                payload = "",
                cmid = cmid,
            ),
        )
        return cmid
    }

    /**
     * The mirror of [enqueue]: a user removing a still-queued media before it
     * uploads. Drops the `UPLOAD_MEDIA` row first (so the drainer stops picking it
     * up) then its stored bytes, leaving no orphaned row that would upload to an
     * unreferenced media. Unknown [cmid]s are inert — both layers tolerate absence.
     */
    suspend fun cancel(cmid: String) {
        outboxRepository.discard(cmid)
        blobStore.remove(cmid)
    }
}
