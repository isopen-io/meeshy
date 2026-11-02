package me.meeshy.app.stories

import me.meeshy.sdk.model.FeedMedia
import me.meeshy.sdk.model.FeedMediaType
import me.meeshy.sdk.model.StoryBackgroundValue
import me.meeshy.sdk.model.StoryItem
import me.meeshy.sdk.model.UploadedMedia

/**
 * « ⋯ › Aperçu » (#13845, iOS `performSoclePreview`) : la composition telle qu'elle sera LUE. Chaque diapo publiable devient
 * la story que la publication enverrait — la même charge que [publishPlans] — puis passe par la projection du lecteur
 * ([StorySlideProjector]) et le lecteur partagé ([StoryScenePlayer]) : l'aperçu ne recopie aucun rendu (loi 6). Un média
 * encore hors ligne n'a pas d'adresse lisible et ne s'y peint pas.
 */
internal object StoryComposerPreview {

    fun items(state: StoryComposerUiState, language: String, floor: StoryBackgroundValue?): List<StoryItem> =
        publishPlans(state, language, floor = floor).mapIndexed { index, plan ->
            val request = plan.request
            StoryItem(
                id = "$PREVIEW_ID_PREFIX$index",
                content = request.content,
                media = request.mediaIds.orEmpty().mapNotNull { id -> state.attachments.firstOrNull { it.id == id }?.toFeedMedia() },
                storyEffects = request.storyEffects,
                visibility = request.visibility,
                originalLanguage = request.originalLanguage,
            )
        }

    private fun UploadedMedia.toFeedMedia(): FeedMedia = FeedMedia(
        id = id,
        type = when {
            mimeType.startsWith("video", ignoreCase = true) -> FeedMediaType.VIDEO
            mimeType.startsWith("audio", ignoreCase = true) -> FeedMediaType.AUDIO
            else -> FeedMediaType.IMAGE
        },
        url = url,
        thumbnailUrl = thumbnailUrl,
        width = width,
        height = height,
        duration = durationMs?.let { (it / MILLIS_PER_SECOND).toInt() },
    )

    private const val PREVIEW_ID_PREFIX = "composer-preview-"
    private const val MILLIS_PER_SECOND = 1000L
}
