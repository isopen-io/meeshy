package me.meeshy.app.stories

import me.meeshy.sdk.model.StoryGroup
import me.meeshy.sdk.model.StoryItem
import me.meeshy.sdk.model.StoryPlaybackSkipResolver
import me.meeshy.sdk.model.StoryViewerInitialAction
import me.meeshy.sdk.model.StoryViewerPosition

/**
 * Ce que l'entrée dans le lecteur demande en plus de la story : la feuille à ouvrir d'office et le commentaire ciblé
 * (notification de commentaire). Consommée une fois, par l'écran, quand la story visée est à l'écran.
 */
data class StoryEntryIntent(
    val action: StoryViewerInitialAction? = null,
    val targetCommentId: String? = null,
    val targetParentCommentId: String? = null,
)

/**
 * Saute les slides illisibles (expirées ou sans rien à montrer) : jamais d'écran noir de six secondes, et le lecteur
 * ne se ferme qu'à épuisement. [items] donne l'élément brut d'une slide ; une slide dont on ne sait rien est tenue pour
 * lisible (conservateur : mieux vaut un écran vide qu'un contenu retiré). Miroir de iOS `StoryPlaybackSkipResolver`.
 */
internal fun StoryPlayback.skippingUnplayable(
    currentUserId: String?,
    items: (String) -> StoryItem?,
    isExpired: (StoryItem) -> Boolean,
): StoryPlayback {
    if (isDismissed || groups.isEmpty()) return this
    val shaped = groups.map { group ->
        StoryGroup(id = group.userId, stories = group.slides.map { items(it.id) ?: StoryItem(id = it.id, content = it.id) })
    }
    return when (val outcome = StoryPlaybackSkipResolver.resolve(shaped, groupIndex, slideIndex, currentUserId, isExpired)) {
        StoryPlaybackSkipResolver.Outcome.Stay -> this
        is StoryPlaybackSkipResolver.Outcome.AdvanceStory -> copy(slideIndex = outcome.index)
        is StoryPlaybackSkipResolver.Outcome.AdvanceGroup -> copy(groupIndex = outcome.groupIndex, slideIndex = outcome.storyIndex)
        StoryPlaybackSkipResolver.Outcome.Close -> dismissed()
    }
}

/**
 * Remet la lecture sur la MÊME story dans une liste de groupes qui a bougé (insertion, tri, expiration) : la position
 * se tient par identité, pas par rang. Plus rien ⇒ lecture fermée. Miroir de iOS `StoryViewerPosition.reanchor`.
 */
internal fun StoryPlayback.reanchoredOn(newGroups: List<StoryGroupSlides>): StoryPlayback {
    fun shapes(of: List<StoryGroupSlides>) = of.map { StoryViewerPosition.GroupShape(it.userId, it.slides.map(StorySlideView::id)) }
    val landing = StoryViewerPosition.reanchor(shapes(groups), shapes(newGroups), StoryViewerPosition.Landing(groupIndex, slideIndex))
        ?: return copy(groups = emptyList(), groupIndex = 0, slideIndex = 0, isDismissed = true)
    return copy(groups = newGroups, groupIndex = landing.group, slideIndex = landing.story)
}

/** Le groupe unique : la lecture ne passe pas à l'auteur suivant (ouverture depuis une notification ou un lien). */
internal fun StoryPlayback.restrictedToCurrentGroup(): StoryPlayback {
    val group = currentGroup ?: return this
    return copy(groups = listOf(group), groupIndex = 0)
}
