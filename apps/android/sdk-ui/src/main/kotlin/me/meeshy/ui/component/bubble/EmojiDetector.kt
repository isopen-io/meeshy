package me.meeshy.ui.component.bubble

/**
 * Port of the iOS `EmojiDetector` (MeeshyUI/Utilities/EmojiDetector.swift):
 * a message whose trimmed content is 1–3 emoji grapheme clusters renders as
 * oversized free-floating emoji. Clusters are counted with a small state
 * machine over code points (ZWJ sequences, skin tones, variation selectors
 * and regional-indicator flag pairs collapse into one cluster each).
 */
public object EmojiDetector {
    public const val MAX_CLUSTERS: Int = 3

    /** 1–3 when the text is emoji-only, 0 otherwise. */
    public fun emojiOnlyCount(text: String): Int {
        val trimmed = text.trim()
        if (trimmed.isEmpty()) return 0
        var clusters = 0
        var openCluster = false
        var pendingJoin = false
        var pendingRegional = false
        var i = 0
        while (i < trimmed.length) {
            val cp = trimmed.codePointAt(i)
            i += Character.charCount(cp)
            when {
                cp == ZWJ -> {
                    if (!openCluster) return 0
                    pendingJoin = true
                }
                isClusterModifier(cp) -> if (!openCluster) return 0
                isRegionalIndicator(cp) -> {
                    if (pendingRegional) {
                        pendingRegional = false
                    } else {
                        pendingRegional = true
                        clusters += 1
                    }
                    openCluster = true
                }
                isEmojiBase(cp) -> {
                    if (pendingJoin) pendingJoin = false else clusters += 1
                    openCluster = true
                }
                else -> return 0
            }
            if (clusters > MAX_CLUSTERS) return 0
        }
        return clusters
    }

    /** The iOS oversized-emoji scale: 1 → 90, 2 → 60, 3 → 45. */
    public fun fontSizeSp(count: Int): Int? = when (count) {
        1 -> 90
        2 -> 60
        3 -> 45
        else -> null
    }

    private const val ZWJ = 0x200D
    private const val VARIATION_SELECTOR = 0xFE0F
    private const val COMBINING_KEYCAP = 0x20E3

    private fun isClusterModifier(cp: Int): Boolean =
        cp == VARIATION_SELECTOR || cp == COMBINING_KEYCAP || cp in 0x1F3FB..0x1F3FF

    private fun isRegionalIndicator(cp: Int): Boolean = cp in 0x1F1E6..0x1F1FF

    private fun isEmojiBase(cp: Int): Boolean =
        cp in 0x1F000..0x1FAFF ||
            cp in 0x2600..0x27BF ||
            cp in 0x2B00..0x2BFF ||
            cp in 0x2934..0x2935 ||
            cp in 0x231A..0x231B ||
            cp in 0x23E9..0x23FA
}
