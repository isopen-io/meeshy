package me.meeshy.sdk.media.scene

import android.content.Context
import android.net.Uri
import androidx.media3.common.Effect
import androidx.media3.common.MediaItem
import androidx.media3.common.MimeTypes
import androidx.media3.common.audio.AudioProcessor
import androidx.media3.common.audio.ChannelMixingAudioProcessor
import androidx.media3.common.audio.ChannelMixingMatrix
import androidx.media3.effect.BitmapOverlay
import androidx.media3.effect.OverlayEffect
import androidx.media3.effect.Presentation
import androidx.media3.transformer.Composition
import androidx.media3.transformer.DefaultEncoderFactory
import androidx.media3.transformer.DefaultMuxer
import androidx.media3.transformer.EditedMediaItem
import androidx.media3.transformer.EditedMediaItemSequence
import androidx.media3.transformer.Effects
import androidx.media3.transformer.ExportException
import androidx.media3.transformer.ExportResult
import androidx.media3.transformer.ProgressHolder
import androidx.media3.transformer.Transformer
import androidx.media3.transformer.VideoEncoderSettings
import com.google.common.collect.ImmutableList
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import me.meeshy.sdk.audioedit.MetadataFreeMuxerFactory
import me.meeshy.sdk.model.composer.scene.SceneExportBackground
import me.meeshy.sdk.model.composer.scene.SceneExportSound
import java.io.File

/**
 * **Le bake d'une scène par Media3 Transformer** (#13431) : le fond (vidéo lue dans sa fenêtre, ou fixe tenu la durée de
 * la slide), le calque des objets posé sur chaque image, puis un son par séquence, mixés par le Composition.
 *
 * **Aucune métadonnée de la source n'est écrite** ([MetadataFreeMuxerFactory], #13462) : le lieu d'une vidéo de fond
 * ne survit pas au rendu — un fichier d'export part hors de Meeshy. Transformer vit sur le fil principal, d'où le
 * dispatcher injecté ; l'annulation de la coroutine arrête l'encodeur ([Transformer.cancel]) et libère les codecs.
 */
internal class Media3SceneTransformRunner(
    private val context: Context,
    private val mainDispatcher: CoroutineDispatcher,
) : SceneTransformRunner {

    override suspend fun run(job: SceneExportJob, onProgress: (Float) -> Unit) {
        withContext(mainDispatcher) {
            coroutineScope {
                val finished = CompletableDeferred<Unit>()
                val transformer = transformer(job, finished)
                transformer.start(composition(job), job.output.absolutePath)
                val ticker = launch {
                    val holder = ProgressHolder()
                    while (true) {
                        if (transformer.getProgress(holder) == Transformer.PROGRESS_STATE_AVAILABLE) {
                            onProgress(holder.progress / PERCENT)
                        }
                        delay(PROGRESS_INTERVAL_MS)
                    }
                }
                try {
                    finished.await()
                    onProgress(1f)
                } catch (cancelled: CancellationException) {
                    transformer.cancel()
                    throw cancelled
                } finally {
                    ticker.cancel()
                }
            }
        }
    }

    private fun transformer(job: SceneExportJob, finished: CompletableDeferred<Unit>): Transformer =
        Transformer.Builder(context)
            .setVideoMimeType(MimeTypes.VIDEO_H264)
            .setAudioMimeType(MimeTypes.AUDIO_AAC)
            .setMuxerFactory(MetadataFreeMuxerFactory(DefaultMuxer.Factory()))
            .setEncoderFactory(
                DefaultEncoderFactory.Builder(context)
                    .setRequestedVideoEncoderSettings(VideoEncoderSettings.Builder().setBitrate(job.recipe.plan.bitRate).build())
                    .build(),
            )
            .addListener(
                object : Transformer.Listener {
                    override fun onCompleted(composition: Composition, exportResult: ExportResult) {
                        finished.complete(Unit)
                    }

                    override fun onError(composition: Composition, exportResult: ExportResult, exportException: ExportException) {
                        finished.completeExceptionally(exportException)
                    }
                },
            )
            .build()

    private fun composition(job: SceneExportJob): Composition {
        val sequences = listOf(EditedMediaItemSequence(listOf(background(job)))) +
            job.recipe.sounds.mapNotNull { sound -> job.soundFiles[sound.id]?.let { sequence(sound, it) } }
        return Composition.Builder(sequences).build()
    }

    private fun background(job: SceneExportJob): EditedMediaItem {
        val plan = job.recipe.plan
        val file = requireNotNull(job.backgroundFile) { "aucun fond a baker" }
        val video = buildList<Effect> {
            add(Presentation.createForWidthAndHeight(plan.width, plan.height, Presentation.LAYOUT_SCALE_TO_FIT_WITH_CROP))
            job.overlay?.let { add(OverlayEffect(ImmutableList.of(BitmapOverlay.createStaticBitmapOverlay(it)))) }
        }
        return when (val background = job.recipe.background) {
            is SceneExportBackground.Video -> EditedMediaItem.Builder(videoItem(file, background))
                .setRemoveAudio(!background.keepsOwnAudio)
                .setEffects(Effects(emptyList(), video))
                .build()
            SceneExportBackground.Still -> EditedMediaItem.Builder(
                MediaItem.Builder().setUri(Uri.fromFile(file)).setImageDurationMs(plan.durationMillis).build(),
            )
                .setFrameRate(plan.fps)
                .setEffects(Effects(emptyList(), video))
                .build()
        }
    }

    private fun videoItem(file: File, background: SceneExportBackground.Video): MediaItem =
        MediaItem.Builder()
            .setUri(Uri.fromFile(file))
            .setClippingConfiguration(
                MediaItem.ClippingConfiguration.Builder()
                    .setStartPositionMs(background.clipStartMillis)
                    .setEndPositionMs(background.clipEndMillis)
                    .build(),
            )
            .build()

    private fun sequence(sound: SceneExportSound, file: File): EditedMediaItemSequence {
        val item = MediaItem.Builder()
            .setUri(Uri.fromFile(file))
            .setClippingConfiguration(
                MediaItem.ClippingConfiguration.Builder().setEndPositionMs(sound.endMillis - sound.startMillis).build(),
            )
            .build()
        val processors = buildList<AudioProcessor> {
            if (sound.startMillis > 0) add(LeadingSilenceAudioProcessor(sound.startMillis))
            if (sound.volume != 1f) add(gain(sound.volume))
        }
        return EditedMediaItemSequence(
            listOf(EditedMediaItem.Builder(item).setRemoveVideo(true).setEffects(Effects(processors, emptyList())).build()),
        )
    }

    private fun gain(volume: Float): AudioProcessor = ChannelMixingAudioProcessor().apply {
        (1..2).forEach { channels -> putChannelMixingMatrix(ChannelMixingMatrix.create(channels, channels).scaleBy(volume)) }
    }

    private companion object {
        const val PERCENT = 100f
        const val PROGRESS_INTERVAL_MS = 200L
    }
}
