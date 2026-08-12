package me.meeshy.sdk.conversation

import kotlinx.serialization.decodeFromString
import kotlinx.serialization.encodeToString
import me.meeshy.sdk.model.SendMessageRequest
import me.meeshy.sdk.net.MeeshyApi

/**
 * The message-send half of the durable upload→send chain (ARCHITECTURE.md §5) —
 * the exact analog of [me.meeshy.sdk.story.PublishMediaWriteBack] for a
 * `SEND_MESSAGE` outbox row instead of a story publish.
 *
 * A message queued with attachments carries each prerequisite upload's `cmid` as a
 * **placeholder** in [SendMessageRequest.attachmentIds] (the real gateway id is
 * unknowable at enqueue time); [graft] swaps that placeholder for the real id the
 * moment its upload lands, so the gated send delivers with an id the gateway can
 * resolve. The drainer calls this over every still-queued dependent of a delivered
 * upload (placeholder = the upload's own `cmid`).
 *
 * Pure and total: it decodes a [SendMessageRequest] payload, rewrites its
 * attachment list and re-encodes, returning `null` whenever the write-back is a
 * no-op — an undecodable payload (including a foreign story publish it cannot own),
 * no attachments, an absent placeholder, or an identity swap — so the caller skips
 * a pointless durable write and the combinator can fall through to the next graft.
 */
public object MessageMediaWriteBack {

    /**
     * Returns [payload] with every [placeholder] attachment id replaced by [realId]
     * (order preserved, duplicates collapsed), or `null` when nothing changes: the
     * payload is not a decodable [SendMessageRequest], carries no attachments, lacks
     * the placeholder, or the swap would leave the list identical.
     */
    public fun graft(payload: String, placeholder: String, realId: String): String? {
        val request = runCatching {
            MeeshyApi.json.decodeFromString<SendMessageRequest>(payload)
        }.getOrNull() ?: return null
        val attachments = request.attachmentIds ?: return null
        if (placeholder !in attachments) return null
        val grafted = attachments.map { if (it == placeholder) realId else it }.distinct()
        if (grafted == attachments) return null
        return MeeshyApi.json.encodeToString(request.copy(attachmentIds = grafted))
    }
}
