package me.meeshy.ui.sticker.template

/**
 * La table des symboles SF d'iOS vers un glyphe que le canevas sait peindre. Un symbole inconnu ne dessine RIEN :
 * jamais un plantage, jamais un carré vide. Les glyphes sont des emoji de repli (un tracé vectoriel Material ne se
 * peint pas dans un bitmap), les mêmes sur tous les appareils d'une version à l'autre.
 */
internal object StickerTemplateIcons {
    private val table: Map<String, String> = mapOf(
        "questionmark" to "❓",
        "sparkles" to "✨",
        "moon.zzz.fill" to "😴",
        "moon.fill" to "🌙",
        "hand.wave.fill" to "👋",
        "hand.thumbsup.fill" to "👍",
        "fork.knife" to "🍴",
        "figure.dance" to "💃",
        "airplane" to "✈️",
        "mappin" to "📍",
        "mappin.and.ellipse" to "📍",
        "mappin.circle.fill" to "📍",
    )

    /** Le glyphe de [symbol], ou `null` quand la table ne le connaît pas. */
    fun glyph(symbol: String): String? = table[symbol]

    val symbols: Set<String> get() = table.keys
}
