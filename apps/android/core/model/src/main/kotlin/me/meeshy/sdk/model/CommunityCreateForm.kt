package me.meeshy.sdk.model

/** Les constantes du formulaire « Nouvelle communauté » (iOS `CommunityCreateScreen`). */
object CommunityCreateForm {
    /** Les quinze emojis proposés, dans l'ordre de la rangée horizontale. */
    val POPULAR_EMOJIS: List<String> = listOf(
        "🚀", "🎮", "🎵", "📚", "💻", "🎨", "❤️", "🔥", "⭐", "🌱", "🌍", "🏆", "📸", "🍿", "🎉",
    )

    /** Nom d'aperçu tant que le champ est vide (la couleur d'accent en dérive : « New »). */
    const val EMPTY_ACCENT_SEED = "New"

    const val MIN_MEMBER_QUERY = 2
    const val MEMBER_RESULT_LIMIT = 10
    const val IDENTIFIER_CHECK_DEBOUNCE_MILLIS = 400L
}

/** L'état de disponibilité de l'identifiant saisi ; seul [Unavailable] bloque la création. */
enum class IdentifierCheck { Idle, Checking, Available, Unavailable }
