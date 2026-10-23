package me.meeshy.sdk.waveform

import android.content.Context
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.ensureActive
import kotlinx.coroutines.withContext
import me.meeshy.core.common.DefaultDispatcher
import me.meeshy.sdk.model.waveform.WaveformLocation
import timber.log.Timber
import java.io.File
import javax.inject.Inject
import javax.inject.Singleton

/**
 * **Le seul endroit qui ouvre de l'audio pour mesurer une onde** (miroir de `WaveformExtractor`,
 * iOS). Un `.wav` PCM est lu tel quel ; tout autre fichier, local ou distant, passe par
 * `MediaExtractor` + `MediaCodec` en PCM, mono par moyenne des canaux, RMS par compartiment.
 *
 * La mesure tourne hors du fil principal et s'annule entre deux blocs décodés : quand la bulle qui
 * l'a demandée quitte l'écran, le décodeur est relâché au bloc suivant. Un fichier illisible rend
 * un relevé vide (jamais une exception : le lecteur garde sa forme de repli).
 */
@Singleton
class WaveformExtractor @Inject constructor(
    @ApplicationContext private val context: Context,
    @DefaultDispatcher private val dispatcher: CoroutineDispatcher,
) : WaveformMeasuring {

    override suspend fun measure(location: WaveformLocation, count: Int): FloatArray {
        if (count <= 0) return FloatArray(0)
        return withContext(dispatcher) {
            val measuring = this
            try {
                open(location) { measuring.ensureActive() }?.use { source ->
                    WaveformStreamMeasurer.measure(source, count) { measuring.ensureActive() }
                } ?: FloatArray(0)
            } catch (cancelled: CancellationException) {
                throw cancelled
            } catch (failure: Exception) {
                Timber.w(failure, "waveform: audio illisible")
                FloatArray(0)
            }
        }
    }

    private fun open(location: WaveformLocation, checkActive: () -> Unit): PcmSource? = when (location) {
        is WaveformLocation.Local -> {
            val file = File(location.path)
            if (!file.isFile || !file.canRead()) null
            else WavPcmSource.open(file) ?: MediaCodecPcmSource.open(context, location, checkActive)
        }
        is WaveformLocation.Remote -> MediaCodecPcmSource.open(context, location, checkActive)
    }
}
