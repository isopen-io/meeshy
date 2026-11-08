package me.meeshy.sdk.model.media

/**
 * La palette de coloration du code (le thème « GitHub » de `SyntaxTheme`, iOS), clair et sombre. Les couleurs sont
 * des entiers ARGB : la couche pure n'importe aucun type d'interface, l'écran les convertit.
 */
data class SyntaxTheme(
    val keyword: Long,
    val string: Long,
    val comment: Long,
    val number: Long,
    val type: Long,
    val function: Long,
    val preprocessor: Long,
    val operator: Long,
    val property: Long,
    val attribute: Long,
    val tag: Long,
    val punctuation: Long,
    val plain: Long,
    val background: Long,
    val lineNumber: Long,
    val lineNumberBorder: Long,
) {
    fun colorOf(type: SyntaxTokenType): Long = when (type) {
        SyntaxTokenType.PLAIN -> plain
        SyntaxTokenType.KEYWORD -> keyword
        SyntaxTokenType.STRING -> string
        SyntaxTokenType.COMMENT -> comment
        SyntaxTokenType.NUMBER -> number
        SyntaxTokenType.TYPE -> this.type
        SyntaxTokenType.FUNCTION -> function
        SyntaxTokenType.PREPROCESSOR -> preprocessor
        SyntaxTokenType.OPERATOR -> operator
        SyntaxTokenType.PROPERTY -> property
        SyntaxTokenType.ATTRIBUTE -> attribute
        SyntaxTokenType.TAG -> tag
        SyntaxTokenType.PUNCTUATION -> punctuation
    }

    companion object {
        val GithubDark: SyntaxTheme = SyntaxTheme(
            keyword = 0xFFFF7B72, string = 0xFFA5D6FF, comment = 0xFF8B949E, number = 0xFF79C0FF,
            type = 0xFFFFA657, function = 0xFFD2A8FF, preprocessor = 0xFFFF7B72, operator = 0xFFFF7B72,
            property = 0xFF79C0FF, attribute = 0xFF7EE787, tag = 0xFF7EE787, punctuation = 0xFFC9D1D9,
            plain = 0xFFE6EDF3, background = 0xFF0D1117, lineNumber = 0x2EFFFFFF, lineNumberBorder = 0x0FFFFFFF,
        )

        val GithubLight: SyntaxTheme = SyntaxTheme(
            keyword = 0xFFCF222E, string = 0xFF0A3069, comment = 0xFF6E7781, number = 0xFF0550AE,
            type = 0xFF953800, function = 0xFF8250DF, preprocessor = 0xFFCF222E, operator = 0xFFCF222E,
            property = 0xFF0550AE, attribute = 0xFF116329, tag = 0xFF116329, punctuation = 0xFF24292F,
            plain = 0xFF24292F, background = 0xFFF6F8FA, lineNumber = 0x2E000000, lineNumberBorder = 0x0F000000,
        )

        fun github(isDark: Boolean): SyntaxTheme = if (isDark) GithubDark else GithubLight
    }
}
