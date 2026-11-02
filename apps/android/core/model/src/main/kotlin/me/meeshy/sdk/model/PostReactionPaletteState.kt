package me.meeshy.sdk.model

/** Ce que l'utilisateur a choisi dans la palette : le cœur garde son geste, tout autre émoji est additif. */
sealed interface PostReactionPick {
    /** Le cœur : l'hôte exécute son bascule optimiste habituel (état « aimé » et compteur). */
    data object Heart : PostReactionPick

    /** Un autre émoji : envoyé tel quel, sans état « aimé » ni compteur à réconcilier. */
    data class Other(val emoji: String) : PostReactionPick
}

/**
 * L'état de la palette de réactions d'un post ou d'un réel — port de `PostReactionPalette.swift`
 * (iOS). Il ne porte ni mise en page ni envoi : l'hôte pose la bande et exécute le choix.
 */
data class PostReactionPaletteState(val isOpen: Boolean = false) {

    fun opened(): PostReactionPaletteState = if (isOpen) this else copy(isOpen = true)

    fun dismissed(): PostReactionPaletteState = if (isOpen) copy(isOpen = false) else this

    /** Choisir ferme la palette ; sur une palette fermée le choix est ignoré (`null`). */
    fun picked(emoji: String): Pair<PostReactionPaletteState, PostReactionPick?> {
        if (!isOpen) return this to null
        val pick = if (emoji == EmojiCatalog.DOUBLE_TAP_EMOJI) PostReactionPick.Heart else PostReactionPick.Other(emoji)
        return copy(isOpen = false) to pick
    }

    companion object {
        /** Durée de l'appui long qui ouvre la palette (`LongPressGesture(minimumDuration: 0.45)`). */
        const val LONG_PRESS_MILLIS: Long = 450L
    }
}
