package me.meeshy.sdk.model.camera

import me.meeshy.sdk.model.composer.capture.CaptureLensFacing

/**
 * Le rendu après la prise est celui d'avant la prise (miroir de `ComposerCaptureMirrorRule` iOS, #9464).
 *
 * L'aperçu de l'objectif avant se voit EN MIROIR ; la photo et la vidéo sortent donc en miroir elles aussi, et
 * debout. Les trames brutes d'analyse restent à l'orientation du capteur : leur loi d'affichage les redresse déjà.
 */
object ComposerCaptureMirrorRule {
    enum class Output { PHOTO, MOVIE, FRAMES }

    fun mirrors(output: Output, facing: CaptureLensFacing): Boolean =
        output != Output.FRAMES && facing == CaptureLensFacing.FRONT

    fun rotatesToPortrait(output: Output): Boolean = output != Output.FRAMES
}
