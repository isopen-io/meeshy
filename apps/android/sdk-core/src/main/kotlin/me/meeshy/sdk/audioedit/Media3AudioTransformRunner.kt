package me.meeshy.sdk.audioedit

import android.content.Context
import android.media.MediaExtractor
import android.net.Uri
import androidx.media3.common.C
import androidx.media3.common.MediaItem
import androidx.media3.common.MimeTypes
import androidx.media3.common.audio.AudioProcessor
import androidx.media3.common.audio.BaseAudioProcessor
import androidx.media3.common.audio.SonicAudioProcessor
import androidx.media3.transformer.Composition
import androidx.media3.transformer.EditedMediaItem
import androidx.media3.transformer.EditedMediaItemSequence
import androidx.media3.transformer.Effects
import androidx.media3.transformer.ExportException
import androidx.media3.transformer.ExportResult
import androidx.media3.transformer.Transformer
import java.io.File
import java.nio.ByteBuffer
import java.nio.ByteOrder
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.withContext
import me.meeshy.sdk.model.audioedit.AudioEditError
import me.meeshy.sdk.model.audioedit.AudioEditPlan
import me.meeshy.sdk.model.audioedit.AudioFadeEnvelope

/**
 * Media3 Transformer derrière [AudioTransformRunner] : un [EditedMediaItem] rogné par tranche
 * gardée, concaténés en une séquence audio ; la vitesse passe par [SonicAudioProcessor]
 * (hauteur conservée), le gain et les fondus par [GainFadeAudioProcessor]. Transformer vit
 * sur le fil principal, d'où le dispatcher injecté.
 */
internal class Media3AudioTransformRunner(
    private val context: Context,
    private val mainDispatcher: CoroutineDispatcher,
) : AudioTransformRunner {

    override suspend fun run(request: AudioTransformRequest) {
        withContext(mainDispatcher) {
            val finished = CompletableDeferred<Unit>()
            val transformer = Transformer.Builder(context)
                .setAudioMimeType(MimeTypes.AUDIO_AAC)
                .addListener(
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
                .build()
            transformer.start(composition(request), request.output.absolutePath)
            try {
                finished.await()
            } catch (cancelled: CancellationException) {
                transformer.cancel()
                throw cancelled
            } catch (failure: ExportException) {
                throw failure.toAudioEditError()
            }
        }
    }

    private fun ExportException.toAudioEditError(): AudioEditError = when (errorCode) {
        ExportException.ERROR_CODE_ENCODER_INIT_FAILED,
        ExportException.ERROR_CODE_ENCODING_FORMAT_UNSUPPORTED,
        -> AudioEditError.ExportUnavailable
        else -> AudioEditError.ExportFailed(message ?: errorCodeName)
    }

    private fun composition(request: AudioTransformRequest): Composition {
        val plan = request.plan
        val items = plan.keptRanges.map { range ->
            val clipping = MediaItem.ClippingConfiguration.Builder()
                .setStartPositionMs((range.start * MILLIS).toLong())
                .setEndPositionMs((range.end * MILLIS).toLong())
                .build()
            val mediaItem = MediaItem.Builder()
                .setUri(Uri.fromFile(request.source))
                .setClippingConfiguration(clipping)
                .build()
            EditedMediaItem.Builder(mediaItem).setRemoveVideo(true).build()
        }
        return Composition.Builder(listOf(EditedMediaItemSequence(items)))
            .setEffects(Effects(processors(plan), emptyList()))
            .build()
    }

    private fun processors(plan: AudioEditPlan): List<AudioProcessor> = buildList {
        if (kotlin.math.abs(plan.speed - 1.0) > SPEED_EPSILON) {
            add(SonicAudioProcessor().apply { setSpeed(plan.speed.toFloat()); setPitch(1f) })
        }
        if (plan.gain != 1f || plan.fadeIn || plan.fadeOut) {
            add(GainFadeAudioProcessor(plan.gain, plan.fadeIn, plan.fadeOut, plan.finalDuration))
        }
    }

    private companion object {
        const val MILLIS = 1000.0
        const val SPEED_EPSILON = 0.001
    }
}

/** Applique le gain linéaire puis l'enveloppe de fondu sur du PCM 16 bits. */
internal class GainFadeAudioProcessor(
    private val gain: Float,
    private val fadeIn: Boolean,
    private val fadeOut: Boolean,
    private val finalDurationSeconds: Double,
) : BaseAudioProcessor() {

    private var sampleRate = 0
    private var channels = 1
    private var framePosition = 0L

    override fun onConfigure(inputAudioFormat: AudioProcessor.AudioFormat): AudioProcessor.AudioFormat {
        if (inputAudioFormat.encoding != C.ENCODING_PCM_16BIT) {
            throw AudioProcessor.UnhandledAudioFormatException(inputAudioFormat)
        }
        sampleRate = inputAudioFormat.sampleRate
        channels = inputAudioFormat.channelCount
        return inputAudioFormat
    }

    override fun onFlush() {
        framePosition = 0L
    }

    override fun queueInput(inputBuffer: ByteBuffer) {
        val output = replaceOutputBuffer(inputBuffer.remaining()).order(ByteOrder.nativeOrder())
        val input = inputBuffer.order(ByteOrder.nativeOrder())
        val enveloped = fadeIn || fadeOut
        while (input.remaining() >= channels * BYTES_PER_SAMPLE) {
            val envelope = if (enveloped) {
                AudioFadeEnvelope.gainAt(framePosition.toDouble() / sampleRate, finalDurationSeconds, fadeIn, fadeOut)
            } else {
                1.0
            }
            val factor = (gain * envelope).toFloat()
            repeat(channels) {
                val scaled = (input.getShort() * factor).toInt().coerceIn(Short.MIN_VALUE.toInt(), Short.MAX_VALUE.toInt())
                output.putShort(scaled.toShort())
            }
            framePosition++
        }
        output.flip()
    }

    private companion object {
        const val BYTES_PER_SAMPLE = 2
    }
}

/** Lit les pistes d'un fichier avec [MediaExtractor] : illisible, sans audio, ou lisible. */
internal class MediaExtractorAudioSourceProbe : AudioSourceProbe {
    override fun status(file: File): AudioSourceStatus {
        val extractor = MediaExtractor()
        return try {
            extractor.setDataSource(file.absolutePath)
            val hasAudio = (0 until extractor.trackCount).any { index ->
                extractor.getTrackFormat(index).getString(android.media.MediaFormat.KEY_MIME)
                    ?.startsWith("audio/") == true
            }
            if (hasAudio) AudioSourceStatus.READABLE else AudioSourceStatus.NO_AUDIO_TRACK
        } catch (failure: Exception) {
            AudioSourceStatus.UNREADABLE
        } finally {
            extractor.release()
        }
    }
}
