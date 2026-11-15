package me.meeshy.ui.component

/**
 * Initials shown by [MeeshyAvatar] when no image is available — the first LETTER of up to the
 * first two words, uppercased (miroir d'iOS `makeInitials`, #8143, et du web `initialsOf`).
 * Seules les lettres comptent : « Théo (foot) » donne « TF », jamais « T( » ; un mot sans lettre
 * (emoji, ponctuation) est sauté. Sans aucune lettre, le premier caractère entier reste le repli.
 * Blank input yields "?".
 */
public fun avatarInitials(name: String): String {
    val trimmed = name.trim()
    if (trimmed.isEmpty()) return "?"
    val letters = trimmed.split(Regex("\\s+"))
        .mapNotNull { word -> word.firstLetter() }
        .take(2)
        .joinToString("")
    return letters.ifEmpty { trimmed.firstCharacter() }.uppercase()
}

private fun String.firstLetter(): String? {
    var index = 0
    while (index < length) {
        val codePoint = codePointAt(index)
        if (Character.isLetter(codePoint)) return String(Character.toChars(codePoint))
        index += Character.charCount(codePoint)
    }
    return null
}

private fun String.firstCharacter(): String = String(Character.toChars(codePointAt(0)))
