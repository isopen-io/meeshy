package me.meeshy.sdk.model.analytics.v2

import kotlinx.serialization.json.JsonElement

data class SocialStoryEvent(
    val story: Action,
    val slideIndex: Int,
    val slideCount: Int,
    val elapsedMs: Int,
) : SocialEventV2Payload {
    enum class Action(val wire: String) {
        REPLY_SENT("reply_sent"),
        QUICK_REACTION("quick_reaction"),
        POLL_VOTE("poll_vote"),
        STICKER_TAP("sticker_tap"),
        LINK_STICKER_TAP("link_sticker_tap"),
        MENTION_STICKER_TAP("mention_sticker_tap"),
        EXIT_BEFORE_END("exit_before_end"),
        TAP_FORWARD("tap_forward"),
        TAP_BACK("tap_back"),
        SWIPE_NEXT_AUTHOR("swipe_next_author"),
        HOLD_PAUSE("hold_pause"),
    }

    override val type get() = SocialEventV2Type.STORY
    override val action get() = story.wire

    override fun fields(): Map<String, JsonElement> = FieldsBuilder().apply {
        put("slideIndex", slideIndex.coerceAtLeast(0))
        put("slideCount", slideCount.coerceAtLeast(0))
        put("elapsedMs", elapsedMs.coerceAtLeast(0))
    }.build()
}

data class SocialNotificationEvent(
    val notification: Action,
    val notificationType: String,
    val channel: Channel,
    val deliveryLatencyMs: Int? = null,
) : SocialEventV2Payload {
    enum class Action(val wire: String) {
        RECEIVED("received"),
        DISPLAYED("displayed"),
        OPENED("opened"),
        DISMISSED("dismissed"),
    }

    enum class Channel(val wire: String) {
        APNS("apns"),
        FCM("fcm"),
        WEBPUSH("webpush"),
        IN_APP("in_app"),
    }

    override val type get() = SocialEventV2Type.NOTIFICATION
    override val action get() = notification.wire

    override fun fields(): Map<String, JsonElement> = FieldsBuilder().apply {
        put("notificationType", notificationType.take(SocialEventV2Wire.NOTIFICATION_TYPE_MAX))
        put("channel", channel.wire)
        put("deliveryLatencyMs", deliveryLatencyMs?.coerceAtLeast(0))
    }.build()
}
