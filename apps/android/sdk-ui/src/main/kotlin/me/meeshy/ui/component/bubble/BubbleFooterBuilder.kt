package me.meeshy.ui.component.bubble

import java.time.ZoneId
import me.meeshy.sdk.model.BubbleEditMark
import me.meeshy.sdk.model.BubbleFooterModel
import me.meeshy.sdk.model.BubbleFooterStyle
import me.meeshy.sdk.model.DeliveryGlyphState
import me.meeshy.sdk.model.isoToEpochMillisOrNull
import me.meeshy.ui.format.bubbleClockLabel

/** Compose le [BubbleFooterModel] d'une bulle depuis son [BubbleContent] (iOS `resolvedFooter`). */
internal object BubbleFooterBuilder {

    /** Émoji seul : pas de citation, au moins un émoji. */
    fun isEmojiOnly(content: BubbleContent): Boolean = content.emojiOnlyCount > 0 && content.replyToText == null

    fun style(content: BubbleContent): BubbleFooterStyle {
        val hasOther = content.text.isNotBlank() || content.files.isNotEmpty() || content.locations.isNotEmpty() ||
            content.audios.isNotEmpty() || content.contactCards.isNotEmpty() || content.replyToText != null ||
            content.replyToId != null || content.storyReply != null
        return BubbleFooterStyle.forContent(
            isEmojiOnly = isEmojiOnly(content),
            hasVisualMedia = content.images.isNotEmpty() || content.videos.isNotEmpty(),
            hasOtherContent = hasOther,
        )
    }

    fun glyphState(content: BubbleContent): DeliveryGlyphState = when (content.deliveryStatus) {
        DeliveryStatus.Pending -> if (content.isSlowSend) DeliveryGlyphState.Slow else DeliveryGlyphState.Sending
        DeliveryStatus.QueuedOffline -> DeliveryGlyphState.Sending
        DeliveryStatus.Sent -> DeliveryGlyphState.Sent
        DeliveryStatus.Delivered -> DeliveryGlyphState.Delivered
        DeliveryStatus.Read -> DeliveryGlyphState.Read
        DeliveryStatus.Failed -> DeliveryGlyphState.Failed
    }

    fun build(
        content: BubbleContent,
        style: BubbleFooterStyle = style(content),
        retryBandShown: Boolean = false,
        zone: ZoneId = ZoneId.systemDefault(),
    ): BubbleFooterModel = BubbleFooterModel.make(
        style = style,
        timestamp = bubbleClockLabel(content.createdAtIso, zone),
        deliveryStatus = glyphState(content),
        isMe = content.isOutgoing,
        isOnline = content.deliveryStatus != DeliveryStatus.QueuedOffline,
        showsTranslate = BubbleFooterModel.offersTranslation(
            hasText = content.text.isNotBlank(),
            isEmojiOnly = isEmojiOnly(content),
            hasAudio = content.audios.isNotEmpty(),
        ),
        sendStartedAtMillis = isoToEpochMillisOrNull(content.createdAtIso),
        retryBandShown = retryBandShown,
        edit = BubbleEditMark.resolve(
            isEdited = content.isEdited && !content.isDeleted,
            isSaving = content.isEditSaving,
            byModerator = content.editedByModerator,
        ),
    )
}
