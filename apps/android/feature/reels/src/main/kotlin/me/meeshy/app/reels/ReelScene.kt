package me.meeshy.app.reels

import me.meeshy.app.stories.NoContentPreferences
import me.meeshy.app.stories.StorySlideProjector
import me.meeshy.app.stories.StorySlideView
import me.meeshy.sdk.lang.LanguageResolver
import me.meeshy.sdk.model.ApiPost
import me.meeshy.sdk.model.ReelMediaLayout
import me.meeshy.sdk.model.StoryEffects
import me.meeshy.sdk.model.StoryItem
import me.meeshy.sdk.model.composesScene
import me.meeshy.sdk.story.toStoryItem
import me.meeshy.sdk.theme.authorAccentHex

/**
 * Un réel COMPOSÉ se rejoue comme sa scène (iOS `ReelSceneRouting.sceneDocument`) : sa vidéo n'en est que le fond,
 * son son vit sur la scène. La projection est celle du lecteur de stories ([StorySlideProjector]) — une même charge
 * se peint donc à l'identique dans l'un et l'autre.
 */
internal object ReelScene {

    /** Les effets portent-ils de quoi composer une scène (objets posés, sons, dessin) ? Un fond seul n'en est pas une. */
    fun isScene(effects: StoryEffects?): Boolean = effects.composesScene()

    fun project(
        post: ApiPost,
        mediaBaseUrl: String?,
        preferences: LanguageResolver.ContentLanguagePreferences?,
    ): StorySlideView? {
        val item = post.toStoryItem()
        if (!isScene(item.storyEffects)) return null
        return StorySlideProjector(mediaBaseUrl).project(item, post.authorAccentHex(), preferences ?: NoContentPreferences)
    }

    /**
     * Ce que l'export rend d'un réel (#13896) : sa scène s'il en compose une, sinon sa vidéo entière, son compris, par la même
     * projection — une vidéo n'est alors que le fond d'une scène vide. Un réel d'images seules n'a pas de vidéo à rendre.
     */
    fun export(
        post: ApiPost,
        scene: StorySlideView?,
        layout: ReelMediaLayout,
        mediaBaseUrl: String?,
        preferences: LanguageResolver.ContentLanguagePreferences?,
    ): Pair<StoryItem, StorySlideView>? {
        val item = post.toStoryItem()
        if (scene != null) return item to scene
        if (layout !is ReelMediaLayout.Video) return null
        return item to StorySlideProjector(mediaBaseUrl).project(item, post.authorAccentHex(), preferences ?: NoContentPreferences)
    }
}
