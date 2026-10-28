package me.meeshy.app.stories

import me.meeshy.sdk.model.StoryAudioPlayerObject
import me.meeshy.sdk.model.composer.scene.ComposerOverflowEntries
import me.meeshy.sdk.model.composer.scene.ComposerSceneBackground
import me.meeshy.sdk.model.composer.scene.SceneExportSoundInput

/**
 * Ce que le bake de la slide sélectionnée lit hors de l'écran : sa durée, son fond VIDÉO (un fond image se peint dans la
 * capture) et ses sons dont l'adresse se résout. Pure : la capture de la scène et le réseau viennent après.
 */
internal data class SceneExportSources(
    val durationSeconds: Double,
    val video: Video?,
    val sounds: List<Sound>,
) {
    data class Video(val url: String, val assetDurationSeconds: Double, val muted: Boolean)

    data class Sound(val input: SceneExportSoundInput, val url: String)

    companion object {
        /** [soundUrl] : l'adresse chargeable d'une piste (`null` ⇒ la piste n'a pas de fichier à lire ici, elle ne part pas). */
        fun from(state: StoryComposerUiState, soundUrl: (StoryAudioPlayerObject) -> String?): SceneExportSources =
            SceneExportSources(
                durationSeconds = state.deck.selectedSlideDurationSeconds,
                video = video(state),
                sounds = state.deck.selectedSlide.audio.mapNotNull { track -> sound(track, soundUrl(track)) },
            )

        private fun video(state: StoryComposerUiState): Video? {
            if (state.selectedSlideSceneBackground != ComposerSceneBackground.VIDEO) return null
            val media = state.deck.selectedSlideBackgroundMediaId?.let { id -> state.attachments.firstOrNull { it.id == id } }
                ?: return null
            return Video(media.url, (media.durationMs ?: 0L) / MILLIS, muted = false)
        }

        private fun sound(track: StoryAudioPlayerObject, url: String?): Sound? {
            val address = url ?: return null
            val start = (track.startTime ?: 0f).toDouble()
            val end = track.duration?.takeIf { it > 0f }?.let { start + it }
            return Sound(SceneExportSoundInput(track.id, start, end, track.volume.toDouble()), address)
        }

        fun hasScene(state: StoryComposerUiState): Boolean {
            val slide = state.deck.selectedSlide
            val objects = slide.elements.count { it.isPublishable } + slide.stickers.count { it.isPublishable } +
                slide.strokes.size + slide.audio.size
            return ComposerOverflowEntries.hasScene(
                objects = objects,
                hasBackground = slide.background != null,
                hasMedia = slide.mediaIds.isNotEmpty(),
            )
        }

        private const val MILLIS = 1000.0
    }
}
