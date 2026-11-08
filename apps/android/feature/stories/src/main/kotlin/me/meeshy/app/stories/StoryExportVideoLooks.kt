package me.meeshy.app.stories

import java.io.File
import me.meeshy.sdk.media.scene.SceneExportPlacedVideo
import me.meeshy.sdk.media.scene.SceneExportVideoLook
import me.meeshy.sdk.model.StoryMediaLook
import me.meeshy.sdk.model.scene.SceneLookMatrix
import me.meeshy.sdk.model.scene.SceneLookRecipe
import me.meeshy.sdk.model.scene.StoryColorMatrix
import me.meeshy.ui.component.retouch.ComposerLookAuthor

/** Le look d'une vidéo réglée tel que la passe de l'export le pose ; `null` : il ne peut pas s'appliquer. */
typealias StoryExportLookResolver =
    suspend (source: File, look: StoryMediaLook, author: ComposerLookAuthor, maxLongSide: Int?) -> SceneExportVideoLook?

/**
 * **LES VIDÉOS RÉGLÉES D'UNE SCÈNE EXPORTÉE** (#14848, #14875) : une scène du compositeur porte encore les looks que la
 * publication cuira ([StorySlideView.composerLooks]). Chaque vidéo, de fond ou posée, dont le look peint une vidéo entre
 * dans le rendu telle qu'elle est, son look à côté d'elle : la passe unique de l'export le pose, sans encoder la vidéo une
 * fois de plus. Une vidéo posée, lue image par image, reçoit son cadre à la taille de ses images décodées. Une même vidéo au
 * même look ne se résout qu'une fois ; un look qui ne peut pas s'appliquer arrête l'export, car rendre l'original trahirait
 * ce que l'auteur a vu.
 *
 * La vidéo de fond porte en plus le look de sa DIAPO ([StorySlideView.lookRecipe], #15224) : le filtre de diapo et les
 * réglages du fond que l'aperçu et le lecteur peignent sur tout le fond, par-dessus le look propre de la vidéo et son cadre.
 */
internal class StoryExportVideoLooks(private val resolve: StoryExportLookResolver) {

    private val resolved = mutableMapOf<Triple<File, StoryMediaLook, Int?>, SceneExportVideoLook>()

    /** Le look de la vidéo de fond de [scene], celui de sa diapo par-dessus ; `null` quand rien ne la peint. */
    suspend fun background(scene: StoryExportScene, files: Map<String, File>): SceneExportVideoLook? {
        val own = ownBackground(scene, files)
        val slide = slideMatrix(scene.slide.lookRecipe) ?: return own
        return own?.underScene(slide) ?: SceneExportVideoLook.ofScene(slide)
    }

    private suspend fun ownBackground(scene: StoryExportScene, files: Map<String, File>): SceneExportVideoLook? {
        val looks = scene.slide.composerLooks ?: return null
        val look = looks.videoLookOf(scene.slide.backgroundVideoUrl) ?: return null
        val source = scene.subject.backgroundVideo?.let(files::get) ?: return null
        return lookOf(source, look, looks.author, maxLongSide = null)
    }

    /** Le look de la vidéo posée [view] lue dans [source] ; `null` quand elle n'est pas réglée. */
    suspend fun placed(scene: StoryExportScene, view: StoryForegroundMediaView, source: File): SceneExportVideoLook? {
        val looks = scene.slide.composerLooks ?: return null
        val look = looks.videoLookOf(view.url) ?: return null
        return lookOf(source, look, looks.author, SceneExportPlacedVideo.DECODED_LONG_SIDE)
    }

    private fun slideMatrix(recipe: SceneLookRecipe): StoryColorMatrix? =
        recipe.takeUnless { it.isNeutral }?.let(SceneLookMatrix::composed)?.takeUnless { it == StoryColorMatrix.IDENTITY }

    private suspend fun lookOf(source: File, look: StoryMediaLook, author: ComposerLookAuthor, maxLongSide: Int?): SceneExportVideoLook {
        val key = Triple(source, look, maxLongSide)
        resolved[key]?.let { return it }
        val applied = checkNotNull(resolve(source, look, author, maxLongSide)) { "le look de la vidéo réglée ${source.name} ne peut pas s'appliquer" }
        return applied.also { resolved[key] = it }
    }
}
