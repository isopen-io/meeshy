package me.meeshy.sdk.model.composer

import me.meeshy.sdk.model.PostType
import me.meeshy.sdk.model.ReelComposition
import me.meeshy.sdk.model.ReelOffer

/**
 * The ONE composer's document, as the host sees it — port of the host-side state of iOS
 * `MeeshyComposerHost` (+Resolution, +Socle). The format is a FIELD of the document, never a door:
 * what the author composed (text, media, scene, audience) survives every format switch, and the
 * offer BREATHES with the composition (reel only while it qualifies, mood only while it is text).
 */
data class ComposerHostState(
    val intent: ComposerIntent,
    val text: String = "",
    val media: List<ReelComposition.MediaKind> = emptyList(),
    val hasScene: Boolean = false,
    val moodEmoji: String? = null,
    val audience: String? = null,
    val chosen: ComposerFormat? = null,
) {
    val reelGate: Boolean get() = ReelComposition.qualifiesAsReel(media)

    val moodGate: Boolean
        get() = ComposerMoodGate.qualifies(text, hasMedia = media.isNotEmpty(), hasScene = hasScene, moodEmoji = moodEmoji)

    val carriesMoreThanText: Boolean get() = media.isNotEmpty() || hasScene

    val hasContent: Boolean get() = text.isNotBlank() || carriesMoreThanText || !moodEmoji.isNullOrEmpty()

    private fun profile(reel: Boolean) =
        ComposerProfile.of(intent.origin, compositionQualifiesAsReel = reel, compositionQualifiesAsMood = moodGate)

    val profile: ComposerProfile get() = profile(reelGate)

    val offeredFormats: List<ComposerFormat> get() = profile.offeredFormats

    /** The format that GOVERNS — the surface mounted and the type published — never one the offer withdrew. */
    val selectedFormat: ComposerFormat
        get() = ComposerFormatFanPolicy.resolvedSelection(
            current = chosen ?: intent.openingFormat(compositionQualifiesAsReel = reelGate),
            offered = offeredFormats,
        )

    /** The menu: the door's formats with the reel kept open, so a reel not yet qualified is greyed with its reason. */
    val verdicts: List<FormatVerdict>
        get() = ComposerFormatAvailability.verdicts(profile(reel = true).offeredFormats, offeredFormats, carriesMoreThanText)

    /** A single entry is an affordance without choice: no chevron. */
    val hasFormatMenu: Boolean get() = verdicts.size > 1

    val working: ComposerWorkingState
        get() = ComposerWorkingState(selectedFormat, text, emptyList(), emptyList(), audience)

    /** One qualifying video composed as a plain post: offer the reel until the author states a format. */
    val offersReelForPost: Boolean
        get() {
            if (selectedFormat != ComposerFormat.POST) return false
            val reelIsChoosable = verdicts.any { it.format == ComposerFormat.REEL && it.isChoosable }
            return reelIsChoosable && ReelOffer.offersReelForPost(
                type = PostType.POST,
                media = media,
                isRepost = intent.origin.repostedPostId != null,
                isEdit = intent.origin is ComposerOrigin.Edit,
                formatChosenByAuthor = chosen != null,
            )
        }

    /** Only a choosable format can be chosen; anything else leaves the state untouched. */
    fun choose(format: ComposerFormat): ComposerHostState =
        if (format in offeredFormats) copy(chosen = format) else this

    fun withText(value: String) = copy(text = value)
    fun withMedia(value: List<ReelComposition.MediaKind>) = copy(media = value)
    fun withScene(value: Boolean) = copy(hasScene = value)
    fun withMoodEmoji(value: String?) = copy(moodEmoji = value)
    fun withAudience(value: String?) = copy(audience = value)

    companion object {
        fun open(intent: ComposerIntent) = ComposerHostState(intent)
    }
}
