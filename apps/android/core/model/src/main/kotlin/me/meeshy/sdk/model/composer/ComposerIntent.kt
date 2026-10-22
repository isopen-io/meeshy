package me.meeshy.sdk.model.composer

/** The intent to write, reduced to what determines it: its door — port of iOS `ComposerIntent`. */
data class ComposerIntent(val origin: ComposerOrigin, val opening: ComposerFormat? = null) {

    /** An explicit [opening] wins only when the door offers it; otherwise the door's initial format. */
    fun openingFormat(compositionQualifiesAsReel: Boolean = false): ComposerFormat {
        val profile = ComposerProfile.of(origin, compositionQualifiesAsReel = compositionQualifiesAsReel)
        return opening?.takeIf { it in profile.offeredFormats } ?: profile.initialFormat
    }
}

/** What a door gives the composer — port of iOS `ComposerProfile`. */
data class ComposerProfile(
    val initialFormat: ComposerFormat,
    val offeredFormats: List<ComposerFormat>,
    val showsSlides: Boolean,
    val showsTimeline: Boolean,
    val opensWith: ComposerOpening,
    val allowsCapture: Boolean,
    val routesToLegacy: LegacyComposer?,
) {
    companion object {
        fun of(
            origin: ComposerOrigin,
            compositionQualifiesAsReel: Boolean = false,
            compositionQualifiesAsMood: Boolean = false,
        ): ComposerProfile {
            fun plusReel(base: List<ComposerFormat>) = if (compositionQualifiesAsReel) base + ComposerFormat.REEL else base
            fun plusMood(base: List<ComposerFormat>) = if (compositionQualifiesAsMood) base + ComposerFormat.STATUS else base
            return when (origin) {
                ComposerOrigin.StoryTray -> ComposerProfile(
                    ComposerFormat.STORY, plusReel(listOf(ComposerFormat.STORY, ComposerFormat.POST)),
                    true, true, ComposerOpening.CAMERA_READY, true, null,
                )
                ComposerOrigin.FeedComposer -> ComposerProfile(
                    ComposerFormat.POST, plusMood(plusReel(listOf(ComposerFormat.POST, ComposerFormat.STORY))),
                    true, true, ComposerOpening.KEYBOARD_ON_CONTENT, true, null,
                )
                ComposerOrigin.MoodChip -> ComposerProfile(
                    ComposerFormat.STATUS, listOf(ComposerFormat.STATUS),
                    false, false, ComposerOpening.MOOD_GRID, false, null,
                )
                is ComposerOrigin.Repost -> ComposerProfile(
                    origin.sourceFormat,
                    if (origin.sourceFormat == ComposerFormat.POST) listOf(ComposerFormat.POST) else listOf(origin.sourceFormat, ComposerFormat.POST),
                    true, true, ComposerOpening.KEYBOARD_ON_CONTENT, false,
                    if (origin.sourceFormat == ComposerFormat.STATUS || origin.sourceFormat == ComposerFormat.STORY) null else LegacyComposer.REPOST_COMPOSER,
                )
                is ComposerOrigin.Edit -> ComposerProfile(
                    origin.documentFormat,
                    when (origin.documentFormat) {
                        ComposerFormat.STORY, ComposerFormat.STATUS -> listOf(origin.documentFormat)
                        ComposerFormat.REEL -> listOf(ComposerFormat.REEL, ComposerFormat.POST)
                        ComposerFormat.POST -> plusReel(listOf(ComposerFormat.POST))
                    },
                    true, true, ComposerOpening.RESUME, false,
                    if (origin.documentFormat == ComposerFormat.STORY) null else LegacyComposer.EDIT_POST_SHEET,
                )
                is ComposerOrigin.Draft, ComposerOrigin.Share -> ComposerProfile(
                    ComposerFormat.POST, plusReel(listOf(ComposerFormat.POST, ComposerFormat.STORY)),
                    true, true, ComposerOpening.RESUME, true, null,
                )
                is ComposerOrigin.ConversationMedia, is ComposerOrigin.SocialMedia -> ComposerProfile(
                    ComposerFormat.STORY, plusReel(listOf(ComposerFormat.STORY, ComposerFormat.POST)),
                    true, true, ComposerOpening.MEDIA_SEEDED, true, null,
                )
            }
        }
    }
}

data class RepostTarget(val postId: String, val targetType: ComposerFormat?)

/** Which post a repost card points at: the original of a chain wins, then the reposted id, then the card. */
object RepostTargeting {
    fun target(
        cardId: String,
        cardType: String?,
        repostOfId: String? = null,
        originalRepostOfId: String? = null,
    ): RepostTarget {
        val raw = cardType?.trim()?.uppercase().orEmpty()
        val type = ComposerFormat.entries.firstOrNull { it.name == raw }
        return RepostTarget(originalRepostOfId ?: repostOfId ?: cardId, type)
    }
}
