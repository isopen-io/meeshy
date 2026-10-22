package me.meeshy.sdk.waveform

import me.meeshy.sdk.model.waveform.WaveformLocation

/**
 * Ce qui mesure l'audio : un relevé de [count] compartiments RMS (valeurs ABSOLUES, jamais
 * divisées par le pic — l'échelle qui les rend lisibles est `WaveformScale`). Vide quand l'audio
 * n'est pas lisible. Une interface pour que le cache se teste sans décodeur.
 */
interface WaveformMeasuring {
    suspend fun measure(location: WaveformLocation, count: Int): FloatArray
}
