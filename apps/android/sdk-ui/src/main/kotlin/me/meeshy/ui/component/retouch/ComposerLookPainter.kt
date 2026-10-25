package me.meeshy.ui.component.retouch

import android.graphics.Bitmap
import me.meeshy.sdk.call.frames.CallFramePortrait
import me.meeshy.sdk.call.frames.CallFrameRenderer
import me.meeshy.sdk.call.montage.CallMontagePainter
import me.meeshy.sdk.call.montage.CallMontagePhoto
import me.meeshy.sdk.model.call.frames.CallFrameTexts
import me.meeshy.sdk.model.call.montage.CallMontageCaption
import me.meeshy.sdk.model.call.montage.CallMontageChoice
import me.meeshy.sdk.model.composer.look.CallFaceLandmarks
import me.meeshy.sdk.model.composer.look.ComposerLiveLookRule
import me.meeshy.sdk.model.composer.look.ComposerLookCanvas
import me.meeshy.sdk.model.composer.look.ComposerLookColorimetry
import me.meeshy.sdk.model.composer.look.ComposerPhotoFrame
import me.meeshy.sdk.model.composer.look.ComposerPhotoLook
import me.meeshy.sdk.model.imageedit.NormalizedCrop
import me.meeshy.ui.component.imageedit.ColorMatrixFallback
import kotlin.math.roundToInt

/** L'auteur tel que les cadres l'écrivent, et ce qu'ils datent : la séance de la prise, jamais l'instant du rendu. */
public data class ComposerLookAuthor(val id: String, val name: String, val handle: String?, val caption: CallMontageCaption, val date: String)

/**
 * **LE PEINTRE UNIQUE DE LA RETOUCHE** — miroir de `ComposerLookPainter` (iOS, #9347) : la colorimétrie du
 * filtre de l'appel, puis l'effet de visage ([RetouchFaceEffects], #12733), puis le cadre — un classique du Montage ([CallMontagePainter]) ou un cadre du catalogue
 * ([CallFrameRenderer]) — sur une toile aux proportions de la prise. L'aperçu, les miniatures et ce qui part
 * passent par [paint] : ce qu'on voit est ce qui part.
 */
public object ComposerLookPainter {

    /**
     * La prise retouchée, dont le grand côté fait au plus [longSide]. `null` si la toile est impossible ou si le
     * cadre choisi ne se peint pas — jamais une photo sans le cadre que l'auteur voyait. [face] : le visage de la
     * prise ENTIÈRE, en proportions ([RetouchFaceDetector]) — l'effet le suit à travers le recadrage.
     */
    public fun paint(
        source: Bitmap,
        look: ComposerPhotoLook,
        author: ComposerLookAuthor,
        longSide: Int,
        crop: NormalizedCrop? = null,
        face: CallFaceLandmarks? = null,
    ): Bitmap? {
        val kept = cropped(source, crop) ?: return null
        val size = ComposerLookCanvas.fitted(kept.width, kept.height, longSide) ?: return null
        val scaled = runCatching { Bitmap.createScaledBitmap(kept, size.width, size.height, true) }.getOrNull() ?: return null
        val graded = ColorMatrixFallback.render(scaled, ComposerLookColorimetry.recipe(look.filter))
        val placed = face?.placed(crop, graded.width.toFloat(), graded.height.toFloat())
        val effected = runCatching { RetouchFaceEffects.apply(look.effect, graded, placed) }.getOrNull() ?: return null
        return framed(effected, look.frame, author)
    }

    /** Le recadrage d'abord : le look se pose sur la prise recadrée, aux proportions qu'elle garde. */
    internal fun cropped(source: Bitmap, crop: NormalizedCrop?): Bitmap? {
        if (crop == null) return source
        val left = (crop.x * source.width).roundToInt().coerceIn(0, source.width - 1)
        val top = (crop.y * source.height).roundToInt().coerceIn(0, source.height - 1)
        val right = ((crop.x + crop.width) * source.width).roundToInt().coerceIn(left + 1, source.width)
        val bottom = ((crop.y + crop.height) * source.height).roundToInt().coerceIn(top + 1, source.height)
        return runCatching { Bitmap.createBitmap(source, left, top, right - left, bottom - top) }.getOrNull()
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
