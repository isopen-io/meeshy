package me.meeshy.ui.component.retouch

import android.graphics.Bitmap
import me.meeshy.sdk.call.frames.CallFramePortrait
import me.meeshy.sdk.call.frames.CallFrameRenderer
import me.meeshy.sdk.call.montage.CallMontagePainter
import me.meeshy.sdk.call.montage.CallMontagePhoto
import me.meeshy.sdk.model.call.frames.CallFrameTexts
import me.meeshy.sdk.model.call.montage.CallMontageCaption
import me.meeshy.sdk.model.call.montage.CallMontageChoice
import me.meeshy.sdk.model.composer.look.ComposerLiveLookRule
import me.meeshy.sdk.model.composer.look.ComposerLookCanvas
import me.meeshy.sdk.model.composer.look.ComposerLookColorimetry
import me.meeshy.sdk.model.composer.look.ComposerPhotoFrame
import me.meeshy.sdk.model.composer.look.ComposerPhotoLook
import me.meeshy.ui.component.imageedit.ColorMatrixFallback

/** L'auteur tel que les cadres l'écrivent, et ce qu'ils datent : la séance de la prise, jamais l'instant du rendu. */
public data class ComposerLookAuthor(val id: String, val name: String, val handle: String?, val caption: CallMontageCaption, val date: String)

/**
 * **LE PEINTRE UNIQUE DE LA RETOUCHE** — miroir de `ComposerLookPainter` (iOS, #9347) : la colorimétrie du
 * filtre de l'appel, puis le cadre — un classique du Montage ([CallMontagePainter]) ou un cadre du catalogue
 * ([CallFrameRenderer]) — sur une toile aux proportions de la prise. L'aperçu, les miniatures et ce qui part
 * passent par [paint] : ce qu'on voit est ce qui part.
 */
public object ComposerLookPainter {

    /**
     * La prise retouchée, dont le grand côté fait au plus [longSide]. `null` si la toile est impossible ou si le
     * cadre choisi ne se peint pas — jamais une photo sans le cadre que l'auteur voyait.
     */
    public fun paint(source: Bitmap, look: ComposerPhotoLook, author: ComposerLookAuthor, longSide: Int): Bitmap? {
        val size = ComposerLookCanvas.fitted(source.width, source.height, longSide) ?: return null
        val scaled = runCatching { Bitmap.createScaledBitmap(source, size.width, size.height, true) }.getOrNull() ?: return null
        val graded = ColorMatrixFallback.render(scaled, ComposerLookColorimetry.recipe(look.filter))
        return framed(graded, look.frame, author)
    }

    private fun framed(graded: Bitmap, frame: ComposerPhotoFrame, author: ComposerLookAuthor): Bitmap? {
        val choice = (frame as? ComposerPhotoFrame.Montage)?.choice ?: return graded
        return when (choice) {
            is CallMontageChoice.Classic -> CallMontagePainter.render(
                choice.style,
                listOf(CallMontagePhoto(author.id, author.name, graded)),
                graded.width,
                graded.height,
                author.caption,
            )
            is CallMontageChoice.Frame -> {
                val design = ComposerLiveLookRule.design(frame) ?: return null
                CallFrameRenderer.render(
                    design,
                    listOf(CallFramePortrait(author.id, author.name, author.handle, isSelf = true, image = graded)),
                    CallFrameTexts(groupName = null, isGroup = false, date = author.date, accentHex = null),
                    graded.width,
                    graded.height,
                )
            }
        }
    }
}
