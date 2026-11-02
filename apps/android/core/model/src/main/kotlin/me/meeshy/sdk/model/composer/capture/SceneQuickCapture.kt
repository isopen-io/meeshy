package me.meeshy.sdk.model.composer.capture

import me.meeshy.sdk.model.composer.ComposerFormat
import me.meeshy.sdk.model.composer.ComposerOpening

/**
 * **La scène VIDE arme le viseur** (#13849) — miroir de `ComposerSceneQuickCapture` et de `ComposerSceneCamera.modes`
 * (iOS). Un toucher sur une scène où rien n'est posé ARME le viseur dans la scène, sans rien prendre ; c'est le second
 * toucher qui prend la photo. Un appui long arme ET filme.
 *
 * Aucun viseur ne se lève au montage (iOS `ComposerSurfaceRouting`, porteur 2026-09-02 #4851) : la porte choisit le MODE
 * que le geste ouvrira ([offer]), jamais un plein écran noir que l'auteur venu composer devrait fermer.
 */
object SceneQuickCapture {

    /** Ce que le viseur de la scène sert : la photo, la vidéo. */
    data class Offer(val allowsPhoto: Boolean, val allowsVideo: Boolean)

    /** La ligne discrète de la scène vide : toucher pour la caméra et maintenir pour filmer, ou filmer seulement. */
    enum class Hint { TAP_OR_HOLD, HOLD_TO_FILM }

    /**
     * Le format d'abord (un réel filme, un mood n'a pas de scène), la porte ensuite : `VIDEO_CAMERA_READY` promet un
     * viseur vidéo, et ne l'ouvre donc jamais en photo ([CameraCaptureMode.forOpening]).
     */
    fun offer(format: ComposerFormat, opening: ComposerOpening): Offer? = when (format) {
        ComposerFormat.STATUS -> null
        ComposerFormat.REEL -> Offer(allowsPhoto = false, allowsVideo = true)
        ComposerFormat.STORY, ComposerFormat.POST ->
            Offer(allowsPhoto = CameraCaptureMode.forOpening(opening) == CameraCaptureMode.PHOTO, allowsVideo = true)
    }

    /** Le geste, et sa ligne d'aide, n'existent que sur une scène vide, viseur éteint, aucun outil ouvert. */
    fun offers(sceneIsBlank: Boolean, armed: Boolean, toolIsOpen: Boolean, offer: Offer?): Boolean =
        offer != null && sceneIsBlank && !armed && !toolIsOpen

    fun hint(offer: Offer): Hint = if (offer.allowsPhoto) Hint.TAP_OR_HOLD else Hint.HOLD_TO_FILM

    /** L'appui long ouvre et filme : seulement là où la vidéo est servie. */
    fun filmsOnHold(offer: Offer): Boolean = offer.allowsVideo
}
