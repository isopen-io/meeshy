package me.meeshy.ui.component

/**
 * Initials shown by [MeeshyAvatar] when no image is available — the first
 * letter of up to the first two words, uppercased. Blank input yields "?".
 */
public fun avatarInitials(name: String): String {
    val words = name.trim().split(Regex("\\s+")).filter { it.isNotBlank() }
    return when {
        words.isEmpty() -> "?"
        words.size == 1 -> words[0].take(1).uppercase()
        else -> (words[0].take(1) + words[1].take(1)).uppercase()
    }
}
