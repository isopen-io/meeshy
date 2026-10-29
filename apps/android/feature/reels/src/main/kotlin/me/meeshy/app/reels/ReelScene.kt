package me.meeshy.app.reels

import me.meeshy.app.stories.NoContentPreferences
import me.meeshy.app.stories.StorySlideProjector
import me.meeshy.app.stories.StorySlideView
import me.meeshy.sdk.lang.LanguageResolver
import me.meeshy.sdk.model.ApiPost
import me.meeshy.sdk.model.StoryEffects
import me.meeshy.sdk.story.toStoryItem
import me.meeshy.sdk.theme.DynamicColorGenerator

/**
 * Un réel COMPOSÉ se rejoue comme sa scène (iOS `ReelSceneRouting.sceneDocument`) : sa vidéo n'en est que le fond,
 * son son vit sur la scène. La projection est celle du lecteur de stories ([StorySlideProjector]) — une même charge
 * se peint donc à l'identique dans l'un et l'autre.
 */
internal object ReelScene {

    /** Les effets portent-ils de quoi composer une scène (objets posés, sons, dessin) ? Un fond seul n'en est pas une. */
    fun isScene(effects: StoryEffects?): Boolean = effects != null && (
        effects.mediaObjects.orEmpty().isNotEmpty() ||
            effects.textObjects.isNotEmpty() ||
            effects.stickerObjects.orEmpty().isNotEmpty() ||
            effects.audioPlayerObjects.orEmpty().isNotEmpty() ||
            effects.drawingStrokes.orEmpty().isNotEmpty()
        )

    fun project(
        post: ApiPost,
        mediaBaseUrl: String?,
        preferences: LanguageResolver.ContentLanguagePreferences?,
    ): StorySlideView? {
        val item = post.toStoryItem()
        if (!isScene(item.storyEffects)) return null
        val accent = DynamicColorGenerator.colorForName(post.author?.displayName ?: post.author?.username ?: post.id)
        return StorySlideProjector(mediaBaseUrl).project(item, accent, preferences ?: NoContentPreferences)
    }
}
