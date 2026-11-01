package me.meeshy.app.stories

import me.meeshy.sdk.model.composer.ComposerObjectKind
import me.meeshy.sdk.model.composer.ComposerObjectTiming

/**
 * La famille d'un objet posé telle que l'auteur la nomme (#13904, iOS `SceneFriseTrack.Kind`) : un média se dit image ou
 * vidéo, une pastille de son « son ». La frise et la feuille Temps en tirent leurs libellés, jamais ceux du texte.
 */
enum class SceneObjectFamily { TEXT, STICKER, IMAGE, VIDEO, PLACE, SOUND }

/** Ce qu'une piste NOMME : le texte posé, l'emoji, le nom du lieu ; `null` — un média, un son — prend le mot de sa famille. */
data class SceneTrackName(val family: SceneObjectFamily, val name: String? = null)

internal fun StoryComposerUiState.familyOf(ref: SceneObjectRef): SceneObjectFamily = when (ref.kind) {
    ComposerObjectKind.TEXT -> SceneObjectFamily.TEXT
    ComposerObjectKind.STICKER -> SceneObjectFamily.STICKER
    ComposerObjectKind.MEDIA -> if (placedMediaIsVideo(ref.id)) SceneObjectFamily.VIDEO else SceneObjectFamily.IMAGE
    ComposerObjectKind.PLACE -> SceneObjectFamily.PLACE
    ComposerObjectKind.AUDIO -> SceneObjectFamily.SOUND
}

/** Le nom de chaque piste d'objet posé de la slide choisie ; le fond et le son d'ambiance n'en ont pas. */
internal val StoryComposerUiState.sceneTrackNames: Map<String, SceneTrackName>
    get() {
        val slide = deck.selectedSlide
        return StorySceneStack.order(slide).associate { ref -> ref.id to SceneTrackName(familyOf(ref), slide.nameOf(ref)) }
    }

private fun StorySlide.nameOf(ref: SceneObjectRef): String? = when (ref.kind) {
    ComposerObjectKind.TEXT -> elements.firstOrNull { it.id == ref.id }?.text
    ComposerObjectKind.STICKER -> stickers.firstOrNull { it.id == ref.id }?.emoji
    ComposerObjectKind.PLACE -> places.firstOrNull { it.id == ref.id }?.place?.name
    ComposerObjectKind.MEDIA, ComposerObjectKind.AUDIO -> null
}?.trim()?.takeIf { it.isNotEmpty() }

/** La famille de l'objet dont la feuille Temps règle la fenêtre. */
internal val StoryComposerUiState.selectedObjectFamily: SceneObjectFamily?
    get() = selectedSceneObject?.takeIf { selectedObjectTiming != null }?.let(::familyOf)

/** Sa fenêtre en début / fin, ce que l'auteur lit (« De 1 s à 3 s ») ; `end == null` : jusqu'à la fin. */
internal val StoryComposerUiState.selectedObjectWindow: ComposerObjectTiming?
    get() = selectedObjectTiming?.let { ComposerObjectTiming.of(it.startSeconds.toDouble(), it.durationSeconds.toDouble()) }
