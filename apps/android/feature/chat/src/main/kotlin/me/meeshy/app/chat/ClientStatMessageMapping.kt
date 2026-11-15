package me.meeshy.app.chat

import me.meeshy.sdk.model.ClientAttachmentKind
import me.meeshy.sdk.model.ClientStatMessage
import me.meeshy.sdk.model.isoToEpochMillisOrNull
import me.meeshy.ui.component.bubble.BubbleContent
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId

/**
 * Reduce an on-screen [BubbleContent] to the [ClientStatMessage] the stats sheet's
 * client-side fallback consumes (see `ConversationStatsProjection.clientComputed`).
 *
 * Coarser than the server aggregation by construction — it is the offline/pre-fetch
 * fallback, not the source of truth:
 *  - the bubble layer carries no author id, so [ClientStatMessage.senderId] keys the
 *    viewer's own messages under [OUTGOING_SENDER_KEY] and everyone else under their
 *    display name (or [UNKNOWN_SENDER_KEY] when even that is absent) — enough to
 *    separate "me" from "them" in a direct chat and named authors in a group;
 *  - the bubble layer renders a video as a thumbnail in [BubbleContent.images], so a
 *    video folds into the IMAGE tally here (the server split stays accurate).
 *
 * [zone] resolves each message's instant to its local calendar day for the activity
 * series; an unparseable/absent timestamp falls back to today in that zone.
 */
internal fun BubbleContent.toClientStatMessage(zone: ZoneId): ClientStatMessage {
    val kinds = buildList {
        repeat(images.size) { add(ClientAttachmentKind.IMAGE) }
        repeat(audios.size) { add(ClientAttachmentKind.AUDIO) }
        repeat(files.size) { add(ClientAttachmentKind.FILE) }
        repeat(locations.size) { add(ClientAttachmentKind.LOCATION) }
    }
    val day = isoToEpochMillisOrNull(createdAtIso)
        ?.let { Instant.ofEpochMilli(it).atZone(zone).toLocalDate() }
        ?: LocalDate.now(zone)
    return ClientStatMessage(
        senderId = if (isOutgoing) OUTGOING_SENDER_KEY else senderName ?: UNKNOWN_SENDER_KEY,
        senderName = senderName,
        content = text,
        attachmentKinds = kinds,
        day = day,
    )
}

/** Grouping key for the viewer's own messages (the bubble layer names no author id). */
internal const val OUTGOING_SENDER_KEY = "__me__"

/** Grouping key for an incoming message whose sender display name is unknown. */
internal const val UNKNOWN_SENDER_KEY = "__unknown__"
