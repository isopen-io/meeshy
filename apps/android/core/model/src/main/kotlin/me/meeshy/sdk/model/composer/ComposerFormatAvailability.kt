package me.meeshy.sdk.model.composer

/** Why a format cannot be taken right now — resolved to a sentence by the UI layer, never here. */
enum class FormatDenial {
    REEL_NEEDS_MATERIAL, MOOD_TEXT_ONLY, MOOD_EMPTY, STORY_FROM_THIS_DOOR, POST_UNAVAILABLE
}

/** A format and what it is worth for the current composition: choosable, or refused with its reason. */
data class FormatVerdict(val format: ComposerFormat, val denial: FormatDenial?) {
    val isChoosable: Boolean get() = denial == null
}

/**
 * Port of iOS `ComposerFormatAvailability`: an impossible profile is GREYED WITH ITS REASON, never
 * absent (#4030). A control without effect is absent; a format one cannot take yet is a product
 * rule the author must be taught.
 */
object ComposerFormatAvailability {
    /** Rendered order is the CANDIDATES' order: a format becoming choosable never jumps under a finger. */
    fun verdicts(
        candidates: List<ComposerFormat>,
        offered: List<ComposerFormat>,
        carriesMoreThanText: Boolean,
    ): List<FormatVerdict> = candidates.map { format ->
        FormatVerdict(format, if (format in offered) null else denial(format, carriesMoreThanText))
    }

    fun denial(format: ComposerFormat, carriesMoreThanText: Boolean): FormatDenial = when (format) {
        ComposerFormat.REEL -> FormatDenial.REEL_NEEDS_MATERIAL
        ComposerFormat.STATUS -> if (carriesMoreThanText) FormatDenial.MOOD_TEXT_ONLY else FormatDenial.MOOD_EMPTY
        ComposerFormat.STORY -> FormatDenial.STORY_FROM_THIS_DOOR
        ComposerFormat.POST -> FormatDenial.POST_UNAVAILABLE
    }
}

object ComposerFormatFanPolicy {
    /**
     * The opening format never leaves the offer. A withdrawn one falls back on the first offered
     * format — always the door's own, since the offer always contains `initialFormat`. Nothing
     * offered: return what we got, never invent a format the door never proposed.
     */
    fun resolvedSelection(current: ComposerFormat, offered: List<ComposerFormat>): ComposerFormat =
        if (current in offered) current else offered.firstOrNull() ?: current
}

/**
 * Mood = a text-only card: text or an emoji already set (it keeps the format open while the author
 * rewrites their sentence), and neither media nor scene. Mutually exclusive with the reel gate.
 */
object ComposerMoodGate {
    fun qualifies(text: String, hasMedia: Boolean, hasScene: Boolean, moodEmoji: String?): Boolean {
        if (hasMedia || hasScene) return false
        if (!moodEmoji.isNullOrEmpty()) return true
        return text.isNotBlank()
    }

    val withoutComposition: Boolean get() = qualifies("", hasMedia = false, hasScene = false, moodEmoji = null)
}
