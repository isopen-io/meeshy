package me.meeshy.app.stories

import java.io.File
import me.meeshy.sdk.model.StoryMediaLook
import me.meeshy.ui.component.retouch.ComposerLookAuthor

/**
 * **LES VIDÉOS RÉGLÉES D'UNE SCÈNE EXPORTÉE** (#14848) : une scène du compositeur porte encore les looks que la publication
 * cuira ([StorySlideView.composerLooks]). Chaque vidéo, de fond ou posée, dont le look peint une vidéo entre donc dans le
 * rendu CUITE par la cuisson de la publication, comme la scène la montrait ; une même vidéo au même look ne se cuit qu'une
 * fois. Une cuisson impossible arrête l'export : rendre l'original trahirait ce que l'auteur a vu.
 */
internal class StoryExportVideoLooks(
    private val bake: suspend (source: File, look: StoryMediaLook, author: ComposerLookAuthor, output: File) -> Boolean,
    private val work: File,
) {
    private val baked = mutableMapOf<Pair<File, StoryMediaLook>, File>()

    /** Les fichiers cuits de [scene], par l'adresse que l'export a rapatriée ; vide quand aucune vidéo n'est réglée. */
    suspend fun baked(scene: StoryExportScene, files: Map<String, File>): Map<String, File> {
        val looks = scene.slide.composerLooks ?: return emptyMap()
        val videos = listOfNotNull(scene.slide.backgroundVideoUrl?.let { it to scene.subject.backgroundVideo }) +
            StoryExportPlacedVideos.videosOf(scene.slide).map { it.url to scene.subject.source.soundSources[it.id] }
        return videos.mapNotNull { (url, address) ->
            val look = looks.videoLookOf(url) ?: return@mapNotNull null
            val source = address?.let(files::get) ?: return@mapNotNull null
            address to bakedFile(source, look, looks.author)
        }.toMap()
    }

    private suspend fun bakedFile(source: File, look: StoryMediaLook, author: ComposerLookAuthor): File {
        baked[source to look]?.let { return it }
        val output = File(work, "look-${baked.size}.mp4")
        check(bake(source, look, author, output)) { "la vidéo réglée ${source.name} ne s'est pas cuite avec son look" }
        return output.also { baked[source to look] = it }
    }
}
