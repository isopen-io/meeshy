package me.meeshy.sdk.model.story

import me.meeshy.sdk.model.FeedMediaType
import me.meeshy.sdk.model.StoryGroup
import me.meeshy.sdk.model.StoryItem

/** Un média de story à précharger : son URL et le type que la charge DÉCLARE (l'extension d'URL peut le corriger). */
data class StoryPreloadMedia(val url: String, val declaredType: FeedMediaType?)

/** Une slide vue du préchargement : ses médias distincts et si le lecteur l'a déjà vue. */
data class StoryPreloadStory(val isViewed: Boolean, val media: List<StoryPreloadMedia>)

/** Les URL média d'une story, distinctes et non vides, dans l'ordre de la charge. */
fun StoryItem.preloadMedia(): List<StoryPreloadMedia> =
    media.mapNotNull { item -> item.url?.takeIf { it.isNotBlank() }?.let { StoryPreloadMedia(it, item.type) } }
        .distinctBy { it.url }

fun StoryItem.toPreloadStory(): StoryPreloadStory = StoryPreloadStory(isViewed, preloadMedia())

/**
 * Le plan de préchargement du plateau (iOS `StoryTrayMediaPreloader`) : deux passes sur les [MAX_GROUPS] premiers
 * groupes. La première prend la première slide NON vue de chaque groupe (celle qu'on tape d'abord, haute priorité) ;
 * la seconde jusqu'à [UPCOMING_PER_GROUP] slides suivantes par groupe. Pur : aucune horloge, aucun réseau.
 */
object StoryTrayPreloadPlan {
    const val MAX_GROUPS: Int = 8
    const val UPCOMING_PER_GROUP: Int = 4

    fun firstSlides(groups: List<List<StoryPreloadStory>>): List<StoryPreloadStory> =
        groups.take(MAX_GROUPS).mapNotNull { stories -> stories.firstOrNull { !it.isViewed } ?: stories.firstOrNull() }

    fun upcomingSlides(groups: List<List<StoryPreloadStory>>): List<StoryPreloadStory> =
        groups.take(MAX_GROUPS).flatMap { stories ->
            val firstUnviewed = stories.indexOfFirst { !it.isViewed }.coerceAtLeast(0)
            stories.drop(firstUnviewed + 1).take(UPCOMING_PER_GROUP)
        }

    fun of(groups: List<StoryGroup>): List<List<StoryPreloadStory>> =
        groups.map { group -> group.stories.map { it.toPreloadStory() } }
}
