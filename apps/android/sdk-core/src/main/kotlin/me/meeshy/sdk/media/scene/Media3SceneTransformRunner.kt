package me.meeshy.sdk.media.scene

import android.content.Context
import android.net.Uri
import androidx.media3.common.MediaItem
import androidx.media3.common.MimeTypes
import androidx.media3.common.audio.AudioProcessor
import androidx.media3.effect.OverlayEffect
import androidx.media3.effect.Presentation
import androidx.media3.effect.TextureOverlay
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
import me.meeshy.sdk.model.scene.export.StoryExportClipRange
import me.meeshy.sdk.model.scene.export.StoryExportVideoFormat
import java.io.File

/**
 * **Le rendu d'un export par Media3 Transformer** (#13431, #13872) : les slides bout à bout dans UNE séquence vidéo (vidéo de
 * fond lue en tours entiers, ou image tenue la durée de la slide), les calques des objets posés à leur instant sur la
 * composition entière ([TimedBitmapOverlay]), puis un son par séquence (entrée à l'heure, coupe, boucle, gain et courbe),
 * mixés par le Composition — la piste son qui JOUE dans le lecteur.
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
                    .setRequestedVideoEncoderSettings(VideoEncoderSettings.Builder().setBitrate(job.format.bitRate).build())
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
        val planned = SceneCompositionPlanner.of(job)
        val video = EditedMediaItemSequence(planned.video.map { videoItem(it, job.format) })
        val sounds = planned.audio.map { sequence -> EditedMediaItemSequence(sequence.map(::audioItem)) }
        val objects = job.overlays.takeIf { it.isNotEmpty() }?.let { TimedBitmapOverlay(it) }
        val overlays = listOfNotNull<TextureOverlay>(objects) + planned.brandLayers.map { BrandCardOverlay(it.file, it.alphaAt) }
        return Composition.Builder(listOf(video) + sounds)
            .apply { if (overlays.isNotEmpty()) setEffects(Effects(emptyList(), listOf(OverlayEffect(ImmutableList.copyOf(overlays))))) }
            .build()
    }

    /** Une plage d'une vidéo de fond (sans son : sa piste, quand elle joue, est une séquence audio du plan), ou une image tenue. */
    private fun videoItem(item: SceneVideoItem, format: StoryExportVideoFormat): EditedMediaItem {
        val fit = Effects(emptyList(), listOf(Presentation.createForWidthAndHeight(format.width, format.height, Presentation.LAYOUT_SCALE_TO_FIT_WITH_CROP)))
        val clip = item.clip
        if (clip == null) {
            return EditedMediaItem.Builder(MediaItem.Builder().setUri(Uri.fromFile(item.file)).setImageDurationMs(item.imageMillis ?: 0L).build())
                .setFrameRate(format.fps)
                .setEffects(fit)
                .build()
        }
        return EditedMediaItem.Builder(clipped(item.file, clip))
            .setRemoveAudio(true)
            .setEffects(fit)
            .build()
    }

    private fun audioItem(item: SceneAudioItem): EditedMediaItem {
        val processors = buildList<AudioProcessor> {
            if (item.leadMillis > 0) add(LeadingSilenceAudioProcessor(item.leadMillis))
            if (item.gain != 1f || item.envelope.isNotEmpty()) add(EnvelopeGainAudioProcessor(item.gain, item.envelope, item.originMillis))
        }
        return EditedMediaItem.Builder(clipped(item.file, item.clip))
            .setRemoveVideo(true)
            .setEffects(Effects(processors, emptyList()))
            .build()
    }

    private fun clipped(file: File, clip: StoryExportClipRange): MediaItem =
        MediaItem.Builder()
            .setUri(Uri.fromFile(file))
            .setClippingConfiguration(
                MediaItem.ClippingConfiguration.Builder()
                    .setStartPositionMs(clip.startMillis)
                    .setEndPositionMs(clip.endMillis)
                    .build(),
            )
            .build()

    private companion object {
        const val PERCENT = 100f
        const val PROGRESS_INTERVAL_MS = 200L
    }
}
