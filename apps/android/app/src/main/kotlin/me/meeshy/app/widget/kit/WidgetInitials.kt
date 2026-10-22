package me.meeshy.app.widget.kit

/** Initiales d'un avatar de widget — miroir de `InitialsAvatar.initials` (MeeshyWidgets.swift). */
internal object WidgetInitials {
    private const val FALLBACK = "?"
    private const val MAX_WORDS = 2

    fun of(name: String): String =
        name.split(' ', '\t', '\n').filter { it.isNotEmpty() }
            .take(MAX_WORDS)
            .joinToString("") { it.first().uppercase() }
            .ifEmpty { FALLBACK }
}
