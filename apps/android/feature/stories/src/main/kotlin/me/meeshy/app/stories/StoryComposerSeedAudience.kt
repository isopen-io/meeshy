package me.meeshy.app.stories

import me.meeshy.sdk.model.StoryVisibility

/**
 * L'audience dont une porte peut AMORCER le composeur (l'onboarding d'un mineur, #13634). Seul FRIENDS voyage :
 * PUBLIC est déjà le défaut, et les modes à sélection exigeraient une liste que la porte ne porte pas.
 */
object StoryComposerSeedAudience {
    fun fromRouteArg(arg: String?): StoryVisibility? =
        StoryVisibility.fromWire(arg.orEmpty()).takeIf { arg != null && it == StoryVisibility.FRIENDS }
}
