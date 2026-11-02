package me.meeshy.sdk.media.scene

import android.content.Context
import androidx.media3.common.MimeTypes
import androidx.media3.transformer.Composition
import androidx.media3.transformer.DefaultEncoderFactory
import androidx.media3.transformer.DefaultMuxer
import androidx.media3.transformer.ExportException
import androidx.media3.transformer.ExportResult
import androidx.media3.transformer.ProgressHolder
import androidx.media3.transformer.Transformer
import androidx.media3.transformer.VideoEncoderSettings
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import me.meeshy.sdk.audioedit.MetadataFreeMuxerFactory

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
                val planned = SceneCompositionPlanner.of(job)
                SceneExportLog.info(planned.describe(job.overlays.size, job.placedVideos))
                transformer.start(Media3SceneComposition.of(job, planned), job.output.absolutePath)
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
                        SceneExportLog.info(
                            "rendu de ${exportResult.durationMs} ms : ${exportResult.videoFrameCount} images, ${exportResult.fileSizeBytes} octets, " +
                                "vidéo ${exportResult.videoEncoderName}, son ${exportResult.audioEncoderName ?: "absent"}",
                        )
                        finished.complete(Unit)
                    }

                    override fun onError(composition: Composition, exportResult: ExportResult, exportException: ExportException) {
                        finished.completeExceptionally(exportException)
                    }
                },
            )
            .build()

    private companion object {
        const val PERCENT = 100f
        const val PROGRESS_INTERVAL_MS = 200L
    }
}
