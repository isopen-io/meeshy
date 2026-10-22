package me.meeshy.sdk.media

import android.content.Context
import android.net.Uri
import androidx.media3.common.Effect
import androidx.media3.common.MediaItem
import androidx.media3.common.MimeTypes
import androidx.media3.effect.FrameDropEffect
import androidx.media3.effect.Presentation
import androidx.media3.transformer.AudioEncoderSettings
import androidx.media3.transformer.Composition
import androidx.media3.transformer.DefaultEncoderFactory
import androidx.media3.transformer.EditedMediaItem
import androidx.media3.transformer.Effects
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
import me.meeshy.sdk.model.media.VideoTargetCodec
import me.meeshy.sdk.model.media.VideoTranscodePlan

/**
 * Media3 Transformer derrière [VideoTransformRunner]. Le remux ne pose ni effet ni type
 * MIME : Transformer recopie alors les échantillons. Le ré-encodage fixe le codec (HEVC
 * ou H.264), le débit vidéo, l'AAC au débit du budget, la cadence plafonnée et la taille
 * cible ; la rotation est cuite dans les pixels. Transformer vit sur le fil principal,
 * d'où le dispatcher injecté.
 */
internal class Media3VideoTransformRunner(
    private val context: Context,
    private val mainDispatcher: CoroutineDispatcher,
) : VideoTransformRunner {

    override suspend fun run(request: VideoTransformRequest, onProgress: (Float) -> Unit) {
        withContext(mainDispatcher) {
            coroutineScope {
                val finished = CompletableDeferred<Unit>()
                val transformer = buildTransformer(request.plan, finished)
                transformer.start(editedItem(request), request.output.absolutePath)
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

    private fun buildTransformer(plan: VideoTranscodePlan, finished: CompletableDeferred<Unit>): Transformer {
        val builder = Transformer.Builder(context).addListener(
            object : Transformer.Listener {
                override fun onCompleted(composition: Composition, exportResult: ExportResult) {
                    finished.complete(Unit)
                }

                override fun onError(
                    composition: Composition,
                    exportResult: ExportResult,
                    exportException: ExportException,
                ) {
                    finished.completeExceptionally(exportException)
                }
            },
        )
        if (plan is VideoTranscodePlan.Transcode) {
            builder
                .setVideoMimeType(
                    if (plan.codec == VideoTargetCodec.HEVC) MimeTypes.VIDEO_H265 else MimeTypes.VIDEO_H264,
                )
                .setAudioMimeType(MimeTypes.AUDIO_AAC)
                .setEncoderFactory(
                    DefaultEncoderFactory.Builder(context)
                        .setRequestedVideoEncoderSettings(
                            VideoEncoderSettings.Builder().setBitrate(plan.videoBitRate).build(),
                        )
                        .setRequestedAudioEncoderSettings(
                            AudioEncoderSettings.Builder().setBitrate(plan.audioBitRate).build(),
                        )
                        .build(),
                )
        }
        return builder.build()
    }

    private fun editedItem(request: VideoTransformRequest): EditedMediaItem {
        val item = EditedMediaItem.Builder(MediaItem.fromUri(Uri.fromFile(request.input)))
        val plan = request.plan
        if (plan is VideoTranscodePlan.Transcode) {
            val videoEffects = buildList<Effect> {
                if (request.dropFrames) add(FrameDropEffect.createDefaultFrameDropEffect(plan.frameRate.toFloat()))
                add(Presentation.createForWidthAndHeight(plan.width, plan.height, Presentation.LAYOUT_SCALE_TO_FIT))
            }
            item.setEffects(Effects(emptyList(), videoEffects))
        }
        return item.build()
    }

    private companion object {
        const val PERCENT = 100f
        const val PROGRESS_INTERVAL_MS = 200L
    }
}
