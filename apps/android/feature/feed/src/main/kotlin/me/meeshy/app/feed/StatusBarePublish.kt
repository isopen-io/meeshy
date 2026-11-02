package me.meeshy.app.feed

/**
 * A mood without a word is confirmed (iOS `ComposerMoodBarePublish`, web `moodPublishStep`, #10527). The rule is pure:
 * the word is measured AFTER trimming, and a republication asks nothing (it already carries its source's status).
 * The gateway accepts an emoji-only status (`hasContent` counts `moodEmoji`), so the old route is unchanged.
 */
object StatusBarePublish {
    enum class Step { PUBLISH, ASK_FOR_A_WORD }

    /** Gateway cap on `moodEmoji` (`z.string().max(10)`), in UTF-16 units — a longer pick would 400 the publish. */
    const val MAX_EMOJI_UNITS = 10

    fun step(text: String, isRepublication: Boolean): Step =
        if (isRepublication || text.isNotBlank()) Step.PUBLISH else Step.ASK_FOR_A_WORD

    /** The emoji chosen OUTSIDE the grid: null while it comes from the offered ones (the grid already shows it). */
    fun customEmoji(emoji: String?, offered: List<String>): String? =
        emoji?.takeIf { it.isNotEmpty() && it !in offered }

    fun acceptsPicked(emoji: String): Boolean = emoji.isNotEmpty() && emoji.length <= MAX_EMOJI_UNITS
}
