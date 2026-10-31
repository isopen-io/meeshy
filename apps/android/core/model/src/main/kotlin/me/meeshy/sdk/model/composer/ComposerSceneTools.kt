package me.meeshy.sdk.model.composer

import me.meeshy.sdk.model.composer.scene.ComposerOverflowEntry
import me.meeshy.sdk.model.composer.scene.ComposerSceneEffect

/** Les six boutons ronds posés sur la scène de la story au repos (#13834), le « ⋯ » en dernier. */
enum class ComposerSceneTool { TEXT, MEDIA, STICKER, SOUND, DRAWING, MORE }

/**
 * Ce que l'appui long sur Média propose (#13845, iOS `ComposerRailDoorLongPress`) : le viseur de la scène (#13849, la
 * seconde entrée de la caméra quand toucher la scène sélectionne au lieu d'armer), la photothèque ou les fichiers.
 */
enum class ComposerMediaSource { CAMERA, PHOTO_LIBRARY, FILES }

/**
 * Ce que le « ⋯ » de la scène range (#13834) : l'aperçu, les réglages de la scène que la colonne ne porte pas, ce que la
 * publication nomme (mentionner, hashtags, lieu — #13846, les portes du rail iOS), l'export, puis « Tout effacer » (#13845, iOS `ComposerOverflowPolicy`). [export] relie une entrée d'export à la loi qui la sert
 * ([me.meeshy.sdk.model.composer.scene.ComposerOverflowEntries]) ; [isDestructive] se peint en alerte et demande confirmation.
 */
enum class ComposerMoreEntry(val export: ComposerOverflowEntry? = null, val isDestructive: Boolean = false) {
    PREVIEW,
    ADD_SLIDE,
    BACKGROUND,
    PICK_BACKGROUND,
    REMOVE_BACKGROUND,
    SLIDE_DURATION,
    ANIMATION,
    TIMING,
    FRAME,
    OPENING_EFFECT,
    VISUAL_EFFECT,
    CAPTION,
    MENTION,
    HASHTAGS,
    PLACE,
    SAVE_TO_PHOTOS(ComposerOverflowEntry.SAVE_TO_PHOTOS),
    SHARE(ComposerOverflowEntry.SHARE),
    CLEAR_ALL(isDestructive = true),
}

/**
 * La scène d'abord (#13834, maquette du 2026-10-30) : la scène occupe l'écran et seuls les contrôles du geste en cours
 * sont posés dessus. Chaque entrée n'est servie que si elle a un effet (loi 4) ; aucune feature n'est retirée, ce que la
 * colonne ne porte pas est rangé dans le « ⋯ ».
 */
object ComposerSceneTools {

    val column: List<ComposerSceneTool> = ComposerSceneTool.entries

    /** Un objet touché ou le pinceau en main : les outils se retirent, la scène et ce qui agit sur l'objet restent. */
    fun toolsServed(objectFocused: Boolean, drawing: Boolean): List<ComposerSceneTool> =
        if (objectFocused || drawing) emptyList() else column

    /**
     * [editsSlides] : faux pendant la modification d'une story publiée, qui ne gagne pas de diapo. [sceneEffects] et
     * [exports] sont ceux que leurs propres lois servent déjà. [hasContent] : une diapo a de quoi être lue (l'aperçu) ;
     * [hasBackground] : une couleur ou un média de fond est posé ; [canPickBackground] : la porte Média n'atteint plus le
     * fond (la scène a déjà un média) et une place reste ; [hasSomethingToErase] : la composition n'est pas vierge.
     */
    data class MoreInput(
        val editsSlides: Boolean,
        val hasBackgroundMedia: Boolean,
        val animated: Boolean,
        val sceneEffects: List<ComposerSceneEffect>,
        val exports: List<ComposerOverflowEntry>,
        val hasContent: Boolean = false,
        val hasBackground: Boolean = false,
        val canPickBackground: Boolean = false,
        val hasSomethingToErase: Boolean = false,
        /** Une story légende chaque diapo ; un post ou un réel écrit son texte hors de la scène (#13863). */
        val captionsSlides: Boolean = true,
    )

    fun moreEntries(input: MoreInput): List<ComposerMoreEntry> = ComposerMoreEntry.entries.filter { entry ->
        when (entry) {
            ComposerMoreEntry.ADD_SLIDE -> input.editsSlides
            ComposerMoreEntry.TIMING -> input.animated
            ComposerMoreEntry.FRAME -> input.hasBackgroundMedia
            ComposerMoreEntry.OPENING_EFFECT -> ComposerSceneEffect.OPENING in input.sceneEffects
            ComposerMoreEntry.VISUAL_EFFECT -> ComposerSceneEffect.VISUAL in input.sceneEffects
            ComposerMoreEntry.SAVE_TO_PHOTOS, ComposerMoreEntry.SHARE -> entry.export in input.exports
            ComposerMoreEntry.BACKGROUND, ComposerMoreEntry.SLIDE_DURATION,
            ComposerMoreEntry.ANIMATION,
            ComposerMoreEntry.MENTION, ComposerMoreEntry.HASHTAGS, ComposerMoreEntry.PLACE -> true
            ComposerMoreEntry.CAPTION -> input.captionsSlides
            ComposerMoreEntry.PREVIEW -> input.hasContent
            ComposerMoreEntry.PICK_BACKGROUND -> input.canPickBackground
            ComposerMoreEntry.REMOVE_BACKGROUND -> input.hasBackground
            ComposerMoreEntry.CLEAR_ALL -> input.hasSomethingToErase
        }
    }

    /**
     * L'appui long n'existe que sur Média ; le toucher bref garde son geste (photothèque, ou le panneau des médias). La
     * caméra n'est proposée que si [cameraServed] : le format a un viseur et il n'est pas déjà armé.
     */
    fun longPressSources(tool: ComposerSceneTool, cameraServed: Boolean = false): List<ComposerMediaSource> =
        if (tool == ComposerSceneTool.MEDIA) ComposerMediaSource.entries.filter { it != ComposerMediaSource.CAMERA || cameraServed } else emptyList()

    /** Une seule diapo n'a rien à choisir : la rangée des vignettes n'existe qu'à partir de deux. */
    fun showsSlideStrip(slideCount: Int): Boolean = slideCount >= 2

    fun showsHistory(canUndo: Boolean, canRedo: Boolean): Boolean = canUndo || canRedo

    /** Le chevron de Publier n'existe que s'il y a un autre format ou une disposition à choisir (route autonome : aucun). */
    fun showsFormatChevron(formats: Int, layouts: Int): Boolean = formats > 1 || layouts > 0

    /** Le pinceau en main, la croix et le socle se retirent : la scène reste entière pour le trait. */
    fun showsSceneChrome(drawing: Boolean): Boolean = !drawing
}
