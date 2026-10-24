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
import androidx.media3.effect.OverlayEffect
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
import me.meeshy.sdk.model.imageedit.NormalizedCrop

/**
 * **LE RENDU D'UNE VIDÉO RETOUCHÉE** (#12650) — la recette de [ComposerVideoEdit] gravée par Media3
 * Transformer : la fenêtre de coupe ([MediaItem.ClippingConfiguration]), le son (muet ⇒ piste retirée,
 * sinon un gain sur chaque canal), le recadrage (effet [Crop], coordonnées normalisées du GPU) et les textes
 * cuits ([OverlayEffect]).
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
    public suspend fun export(context: Context, input: File, edit: ComposerVideoEdit, output: File, overlay: Bitmap? = null) {
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
            transformer.start(editedItem(input, edit, overlay), output.absolutePath)
            try {
                finished.await()
            } catch (cancelled: CancellationException) {
                transformer.cancel()
                throw cancelled
            }
        }
    }

    private fun editedItem(input: File, edit: ComposerVideoEdit, overlay: Bitmap?): EditedMediaItem {
        val media = MediaItem.Builder()
            .setUri(Uri.fromFile(input))
            .setClippingConfiguration(
                MediaItem.ClippingConfiguration.Builder()
                    .setStartPositionMs(edit.clipStartMs)
                    .setEndPositionMs(edit.clipEndMs)
                    .build(),
            )
            .build()
        val video = buildList<Effect> {
            edit.crop?.let { ndc(it) }?.let { add(Crop(it[0], it[1], it[2], it[3])) }
            overlay?.let { add(OverlayEffect(ImmutableList.of(BitmapOverlay.createStaticBitmapOverlay(it)))) }
        }
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
