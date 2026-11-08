package me.meeshy.sdk.model.composer.look

import me.meeshy.sdk.model.StoryTextObject
import me.meeshy.sdk.model.imageedit.NormalizedCrop

/**
 * **LA RECETTE D'UNE PHOTO RETOUCHÉE** (#14844) — ce que « Terminé » garde à côté de l'original : le look (filtre,
 * cadre, effet), le recadrage et son preset, les textes écrits. La retouche rouverte la restaure entière et modifiable ;
 * seule la cuisson en fait des pixels, et l'original n'est jamais remplacé.
 */
public data class ComposerPhotoRecipe(
    val look: ComposerPhotoLook = ComposerPhotoLook(),
    val crop: NormalizedCrop? = null,
    val cropPreset: ComposerCropPreset? = null,
    val texts: List<StoryTextObject> = emptyList(),
) {
    /** Rien n'a été choisi ni écrit : la pièce part avec ses octets d'origine. */
    public val isUntouched: Boolean get() = look.isUntouched && crop == null && texts.isEmpty()
}

/** La retouche rouverte sur sa recette : le look et le recadrage reviennent, l'écran reste à l'entrée. */
public fun ComposerRetouchState.restoring(recipe: ComposerPhotoRecipe): ComposerRetouchState =
    copy(look = recipe.look, crop = recipe.crop, cropPreset = recipe.cropPreset)

/** La recette que « Terminé » écrit : l'état choisi et les seuls textes écrits. */
public fun ComposerRetouchState.recipe(texts: List<StoryTextObject>): ComposerPhotoRecipe =
    ComposerPhotoRecipe(look = look, crop = crop, cropPreset = cropPreset, texts = texts.filter { it.text.isNotBlank() })
