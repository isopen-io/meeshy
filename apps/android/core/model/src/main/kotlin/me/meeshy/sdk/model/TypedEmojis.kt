package me.meeshy.sdk.model

import me.meeshy.sdk.model.reading.focal.GraphemeClusters

/**
 * The emojis of a typed text, in typing order — port of iOS `RecentEmojiHistory.emojis(in:)`.
 * A sent message feeds them to the recents ([EmojiUsageRanker.recordRecent]), so an emoji
 * typed from the keyboard ranks like one picked from the sheet. A cluster counts as an emoji
 * when its first scalar is pictographic or a flag; a digit, `#` or `*` (which only become
 * emojis through a keycap) never do.
 */
object TypedEmojis {

    fun extract(text: String): List<String> =
        GraphemeClusters.split(text).filter(::isEmojiCluster)

    private fun isEmojiCluster(cluster: String): Boolean {
        if (cluster.isEmpty()) return false
        val first = cluster.codePointAt(0)
        return first in 0x1F000..0x1FAFF ||
            first in 0x2600..0x27BF ||
            first in 0x2B00..0x2BFF ||
            first in 0x2934..0x2935 ||
            first in 0x231A..0x231B ||
            first in 0x23E9..0x23FA
    }
}
