package me.meeshy.app.stories

import me.meeshy.sdk.model.StoryItem
import me.meeshy.sdk.model.StorySourceWindowMs
import me.meeshy.sdk.model.net.MediaRequestCredential
import me.meeshy.sdk.model.scene.export.StoryExportSlideSource
import me.meeshy.sdk.model.scene.export.StoryExportSoundObject
import me.meeshy.sdk.model.scene.export.StoryExportSoundRole
import me.meeshy.sdk.model.scene.export.StoryExportTimeline
import me.meeshy.sdk.util.resolveMediaUrl

/**
 * Une scène à exporter : ce qu'elle fait entendre ([subject]) et sa projection ([slide]), celle que le lecteur peint. Une story
 * en est une ; un post à scène ou un réel en porte une par scène, rendues l'une après l'autre (#13896).
 */
data class StoryExportScene(val subject: StoryExportSubject, val slide: StorySlideView) {
    companion object {
        fun of(item: StoryItem, slide: StorySlideView, apiBaseUrl: String?): StoryExportScene =
            StoryExportScene(StoryExportSubject.of(item, slide, apiBaseUrl), slide)
    }
}

/**
 * Ce qu'une story exporte : ses objets sonores à l'adresse où le lecteur les joue, et sa vidéo de fond avec la fenêtre
 * que l'auteur a taillée. Une story héritée, qui ne nomme aucun objet sonore, exporte la piste et la vidéo que la
 * projection lui a résolues.
 */
data class StoryExportSubject(
    val source: StoryExportSlideSource,
    val backgroundVideo: String?,
    val backgroundWindow: StorySourceWindowMs?,
) {
    val downloads: List<String>
        get() = (listOfNotNull(backgroundVideo) + source.soundSources.values + listOfNotNull(source.legacyBackgroundTrack, source.legacyBackgroundVideo))
            .distinct()

    companion object {
        fun of(item: StoryItem, slide: StorySlideView, apiBaseUrl: String?): StoryExportSubject {
            val effects = item.storyEffects
            val objects = effects?.let(StoryExportTimeline::soundObjects).orEmpty()
            val sources = objects.mapNotNull { sound -> address(item, sound, apiBaseUrl)?.let { sound.id to it } }.toMap()
            val roles = objects.map { it.role }.toSet()
            return StoryExportSubject(
                source = StoryExportSlideSource(
                    effects = effects,
                    soundSources = sources,
                    legacyBackgroundTrack = slide.backgroundAudioUrl.takeUnless { StoryExportSoundRole.BACKGROUND_TRACK in roles },
                    legacyBackgroundVideo = slide.backgroundVideoUrl.takeUnless { StoryExportSoundRole.BACKGROUND_VIDEO in roles },
                ),
                backgroundVideo = slide.backgroundVideoUrl,
                backgroundWindow = slide.backgroundVideoWindow,
            )
        }

        private fun address(item: StoryItem, sound: StoryExportSoundObject, apiBaseUrl: String?): String? {
            val piece = item.media.firstOrNull { it.id == sound.postMediaId && sound.postMediaId.isNotBlank() }?.url
            val video = sound.role == StoryExportSoundRole.BACKGROUND_VIDEO || sound.role == StoryExportSoundRole.FOREGROUND_VIDEO
            if (video) return (sound.mediaUrl ?: piece)?.takeIf { it.isNotBlank() }?.let { resolveMediaUrl(it, apiBaseUrl) }
            return piece?.takeIf { it.isNotBlank() }?.let { resolveMediaUrl(it, apiBaseUrl) }
                ?: MediaRequestCredential.libraryAudioUrl(sound.mediaUrl, apiBaseUrl)
        }
    }
}
