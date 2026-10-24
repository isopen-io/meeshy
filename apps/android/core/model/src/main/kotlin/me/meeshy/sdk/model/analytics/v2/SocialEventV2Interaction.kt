package me.meeshy.sdk.model.analytics.v2

import kotlinx.serialization.json.JsonElement

data class SocialInteraction(
    val interaction: Action,
    val destination: ShareDestination? = null,
    val dwellBeforeMs: Int? = null,
    val mutationId: String? = null,
) : SocialEventV2Payload {
    enum class Action(val wire: String) {
        REACT("react"),
        UNREACT("unreact"),
        COMMENT_OPEN("comment_open"),
        COMMENT_SUBMIT("comment_submit"),
        SHARE("share"),
        SAVE("save"),
        UNSAVE("unsave"),
        FOLLOW("follow"),
        UNFOLLOW("unfollow"),
        PROFILE_TAP("profile_tap"),
        HASHTAG_TAP("hashtag_tap"),
        SOUND_TAP("sound_tap"),
        MENTION_TAP("mention_tap"),
        CAPTION_EXPAND("caption_expand"),
        TRANSLATION_TOGGLE("translation_toggle"),
        ORIGINAL_VIEW("original_view"),
        REPOST("repost"),
        QUOTE("quote"),
        DOWNLOAD_OPEN("download_open"),
    }

    enum class ShareDestination(val wire: String) {
        COPY_LINK("copy_link"),
        CONVERSATION("conversation"),
        NATIVE_SHEET("native_sheet"),
        STORY("story"),
        REPOST("repost"),
        EXTERNAL_APP("external_app"),
        OTHER("other"),
    }

    override val type get() = SocialEventV2Type.INTERACTION
    override val action get() = interaction.wire

    override fun fields(): Map<String, JsonElement> = FieldsBuilder().apply {
        val shareDestination = if (interaction == Action.SHARE) destination ?: ShareDestination.OTHER else null
        put("destination", shareDestination?.wire)
        put("dwellBeforeMs", dwellBeforeMs?.coerceAtLeast(0))
        put("mutationId", mutationId)
    }.build()
}

data class SocialNegative(
    val negative: Action,
    val reasonCode: String? = null,
    val visibleMs: Int? = null,
) : SocialEventV2Payload {
    enum class Action(val wire: String) {
        QUICK_SKIP("quick_skip"),
        NOT_INTERESTED("not_interested"),
        SEE_LESS("see_less"),
        HIDE("hide"),
        HIDE_AUTHOR("hide_author"),
        MUTE_AUTHOR("mute_author"),
        REPORT_OPEN("report_open"),
        REPORT_SUBMIT("report_submit"),
        BLOCK("block"),
        UNFOLLOW_FROM_CONTENT("unfollow_from_content"),
    }

    override val type get() = SocialEventV2Type.NEGATIVE
    override val action get() = negative.wire

    override fun fields(): Map<String, JsonElement> = FieldsBuilder().apply {
        put("reasonCode", reasonCode?.take(SocialEventV2Wire.REASON_CODE_MAX))
        put("visibleMs", visibleMs)
    }.build()

    companion object {
        const val QUICK_SKIP_THRESHOLD_MS = 1_000

        /** Le skip RAPIDE : quitté avant 1 s de visibilité. Nul dès qu'on est resté assez. */
        fun quickSkip(visibleMs: Int): SocialNegative? {
            if (visibleMs < 0 || visibleMs >= QUICK_SKIP_THRESHOLD_MS) return null
            return SocialNegative(Action.QUICK_SKIP, visibleMs = visibleMs)
        }
    }
}

/** Un lien ne porte que son domaine enregistrable ou son jeton de suivi, jamais l'URL. */
data class SocialLinkEvent(
    val link: Action,
    val domain: String,
    val trackingLinkId: String? = null,
) : SocialEventV2Payload {
    enum class Action(val wire: String) {
        OUTBOUND_CLICK("outbound_click"),
        TRACKING_LINK_FOLLOWED("tracking_link_followed"),
        PREVIEW_OPEN("preview_open"),
    }

    override val type get() = SocialEventV2Type.LINK
    override val action get() = link.wire

    override fun fields(): Map<String, JsonElement> = FieldsBuilder().apply {
        put("domain", domain)
        put("trackingLinkId", trackingLinkId)
    }.build()
}

/** Une recherche ne porte que la longueur de la requête, jamais son texte. */
data class SocialDiscovery(
    val discovery: Action,
    val searchId: String? = null,
    val queryLength: Int? = null,
    val queryLanguage: String? = null,
    val resultCount: Int? = null,
    val resultKind: ResultKind? = null,
) : SocialEventV2Payload {
    enum class Action(val wire: String) {
        SEARCH_SUBMITTED("search_submitted"),
        SEARCH_RESULT_CLICK("search_result_click"),
        SEARCH_ABANDONED("search_abandoned"),
        PROFILE_VISIT("profile_visit"),
        HASHTAG_VISIT("hashtag_visit"),
        SOUND_VISIT("sound_visit"),
        COMMUNITY_VISIT("community_visit"),
    }

    enum class ResultKind(val wire: String) {
        POST("post"),
        PROFILE("profile"),
        HASHTAG("hashtag"),
        SOUND("sound"),
        COMMUNITY("community"),
        MIXED("mixed"),
        OTHER("other"),
    }

    override val type get() = SocialEventV2Type.DISCOVERY
    override val action get() = discovery.wire

    override fun fields(): Map<String, JsonElement> = FieldsBuilder().apply {
        put("searchId", searchId)
        put("queryLength", queryLength)
        put("queryLanguage", queryLanguage)
        put("resultCount", resultCount)
        put("resultKind", resultKind?.wire)
    }.build()
}
