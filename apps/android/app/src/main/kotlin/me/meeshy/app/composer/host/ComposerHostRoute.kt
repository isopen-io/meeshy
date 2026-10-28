package me.meeshy.app.composer.host

import me.meeshy.sdk.model.composer.ComposerOrigin

/**
 * Les portes de l'hôte unique, telles qu'elles voyagent dans une route. Seules les portes que l'hôte
 * porte DÉJÀ y entrent : une origine que son profil route encore vers l'ancien compositeur (republication,
 * édition) ne passe pas par ici — l'ancien chemin reste tant que tout n'est pas porté.
 */
object ComposerHostRoute {
    const val ORIGIN_ARG = "origin"
    const val PATTERN = "composer?$ORIGIN_ARG={$ORIGIN_ARG}"

    private const val STORY_TRAY = "story"
    private const val FEED = "feed"
    private const val MOOD = "mood"

    fun route(origin: ComposerOrigin): String? = wire(origin)?.let { "composer?$ORIGIN_ARG=$it" }

    fun origin(wire: String?): ComposerOrigin = when (wire) {
        STORY_TRAY -> ComposerOrigin.StoryTray
        MOOD -> ComposerOrigin.MoodChip
        else -> ComposerOrigin.FeedComposer
    }

    private fun wire(origin: ComposerOrigin): String? = when (origin) {
        ComposerOrigin.StoryTray -> STORY_TRAY
        ComposerOrigin.FeedComposer -> FEED
        ComposerOrigin.MoodChip -> MOOD
        else -> null
    }
}
