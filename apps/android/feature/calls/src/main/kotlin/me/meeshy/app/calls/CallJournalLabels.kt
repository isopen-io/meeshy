package me.meeshy.app.calls

/**
 * Les libellés composés d'une ligne du journal : la phrase que TalkBack lit pour toute la ligne
 * (iOS `rowAccessibilityLabel`). Les morceaux arrivent déjà localisés ; ce site unique ne fait
 * que les ordonner et sauter les absents.
 */
internal object CallJournalLabels {

    fun accessibility(
        name: String,
        participants: String?,
        direction: String,
        type: String,
        age: String,
        duration: String?,
    ): String =
        listOf(name, participants, direction, type, age, duration)
            .filterNot { it.isNullOrBlank() }
            .joinToString(", ")
}
