package me.meeshy.sdk.media

import android.content.Context
import android.graphics.Bitmap
import android.net.Uri
import androidx.media3.common.Effect
import androidx.media3.common.MediaItem
import androidx.media3.common.audio.AudioProcessor
import androidx.media3.common.audio.ChannelMixingAudioProcessor
import androidx.media3.common.audio.ChannelMixingMatrix
import androidx.media3.effect.BitmapOverlay
import androidx.media3.effect.Crop
import androidx.media3.effect.MatrixTransformation
import androidx.media3.effect.OverlayEffect
import androidx.media3.effect.RgbMatrix
import com.google.common.collect.ImmutableList
import androidx.media3.transformer.Composition
import androidx.media3.transformer.EditedMediaItem
import androidx.media3.transformer.Effects
import androidx.media3.transformer.ExportException
import androidx.media3.transformer.ExportResult
import androidx.media3.transformer.Transformer
import java.io.File
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import me.meeshy.sdk.model.composer.look.ComposerVideoEdit
import me.meeshy.sdk.model.composer.look.ComposerVideoFramePlacement
import me.meeshy.sdk.model.imageedit.NormalizedCrop

/**
 * **LE RENDU D'UNE VIDÉO RETOUCHÉE** (#12650) — la recette de [ComposerVideoEdit] gravée par Media3
 * Transformer : la fenêtre de coupe ([MediaItem.ClippingConfiguration]), le son (muet ⇒ piste retirée,
 * sinon un gain sur chaque canal), puis les images par [RetouchVideoEffects] — les mêmes effets que l'aperçu.
 */
public object RetouchVideoExporter {

    /** Les bornes du recadrage en coordonnées normalisées du GPU (−1…1, y vers le HAUT) : gauche, droite, bas, haut. */
    public fun ndc(crop: NormalizedCrop): FloatArray = floatArrayOf(
        crop.x * 2 - 1,
        (crop.x + crop.width) * 2 - 1,
        1 - (crop.y + crop.height) * 2,
        1 - crop.y * 2,
    )

    /** [overlay] : les textes cuits, à la taille de la vidéo rendue (recadrage compris), posés sur chaque image. */
    public suspend fun export(
        context: Context,
        input: File,
        edit: ComposerVideoEdit,
        output: File,
        overlay: Bitmap? = null,
        look: RetouchVideoLook = RetouchVideoLook.NONE,
    ) {
        withContext(Dispatchers.Main) {
            val finished = CompletableDeferred<Unit>()
            val transformer = Transformer.Builder(context).addListener(
                object : Transformer.Listener {
                    override fun onCompleted(composition: Composition, exportResult: ExportResult) {
                        finished.complete(Unit)
                    }

                    override fun onError(composition: Composition, exportResult: ExportResult, exportException: ExportException) {
                        finished.completeExceptionally(exportException)
                    }
                },
            ).build()
            transformer.start(editedItem(input, edit, RetouchVideoEffects.of(edit.crop?.let(::ndc), look, overlay)), output.absolutePath)
            try {
                finished.await()
            } catch (cancelled: CancellationException) {
                transformer.cancel()
                throw cancelled
            }
        }
    }

    private fun editedItem(input: File, edit: ComposerVideoEdit, video: List<Effect>): EditedMediaItem {
        val media = MediaItem.Builder()
            .setUri(Uri.fromFile(input))
            .setClippingConfiguration(
                MediaItem.ClippingConfiguration.Builder()
                    .setStartPositionMs(edit.clipStartMs)
                    .setEndPositionMs(edit.clipEndMs)
                    .build(),
            )
            .build()
        val audio = buildList<AudioProcessor> { if (!edit.removesAudio && !edit.sound.isUntouched) add(gainProcessor(edit.sound.effectiveGain.toFloat())) }
        return EditedMediaItem.Builder(media)
            .setRemoveAudio(edit.removesAudio)
            .setEffects(Effects(audio, video))
            .build()
    }

    private fun gainProcessor(gain: Float): AudioProcessor = ChannelMixingAudioProcessor().apply {
        (1..2).forEach { channels -> putChannelMixingMatrix(ChannelMixingMatrix.create(channels, channels).scaleBy(gain)) }
    }
}

/**
 * Le look d'une vidéo, prêt pour le GPU : la matrice de couleur du filtre, le calque du cadre (troué où la prise se
 * voit) et où poser la vidéo dans sa case. [NONE] ne touche à rien.
 */
public class RetouchVideoLook(
    public val rgbMatrix: FloatArray? = null,
    public val frame: Bitmap? = null,
    public val placement: ComposerVideoFramePlacement? = null,
) {
    public companion object {
        public val NONE: RetouchVideoLook = RetouchVideoLook()
    }
}

/**
 * **LES EFFETS D'IMAGE D'UNE VIDÉO RETOUCHÉE** (#12650, #12736) — une seule liste pour l'aperçu (ExoPlayer) et le
 * rendu (Transformer) : ce qu'on voit est ce qui part. Dans l'ordre : le recadrage ([Crop], bornes du GPU), la
 * couleur du filtre ([RgbMatrix]), la pose dans la case du cadre ([MatrixTransformation]), puis le cadre et les
 * textes cuits ([OverlayEffect]).
 */
public object RetouchVideoEffects {
    public fun of(cropNdc: FloatArray?, look: RetouchVideoLook, text: Bitmap? = null): List<Effect> = buildList {
        cropNdc?.let { add(Crop(it[0], it[1], it[2], it[3])) }
        look.rgbMatrix?.let { matrix -> add(RgbMatrix { _, _ -> matrix }) }
        look.placement?.let { place -> add(MatrixTransformation { android.graphics.Matrix().apply { setScale(place.scale, place.scale); postTranslate(place.translateX, place.translateY) } }) }
        val overlays = listOfNotNull(look.frame, text).map { BitmapOverlay.createStaticBitmapOverlay(it) }
        if (overlays.isNotEmpty()) add(OverlayEffect(ImmutableList.copyOf(overlays)))
    }
}
