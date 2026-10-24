package me.meeshy.sdk.waveform

import me.meeshy.sdk.model.waveform.WaveformLocation
import me.meeshy.sdk.model.waveform.WaveformResolution
import me.meeshy.sdk.model.waveform.WaveformScale
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Ce que les lecteurs (bulle audio, bande de transcription, rogneur) reçoivent : des valeurs
 * `0..1` lues en LINÉAIRE (le champ publié, crête à 1) et d'où elles viennent.
 */
data class WaveformLevels(val values: List<Float>, val origin: Origin) {

    enum class Origin {
        /** Les niveaux relevés à l'enregistrement du message : aucun décodage. */
        RECORDED,

        /** Mesurés sur le fichier. */
        DECODED,

        /** Rien de lisible : le lecteur garde sa forme de repli déterministe (`WaveformDisplayCurve`). */
        UNAVAILABLE,
    }

    companion object {
        val Unavailable = WaveformLevels(emptyList(), Origin.UNAVAILABLE)
    }
}

/**
 * **L'entrée des lecteurs vers la forme d'onde** (miroir de `AudioWaveformAnalyzer`, iOS, sans son
 * état d'écran) : elle choisit entre les niveaux déjà enregistrés et la mesure, ramène la mesure au
 * contrat du champ publié, et rend l'image d'une vignette. Le cache fait le reste (calcul unique,
 * mémoire, disque).
 *
 * Les lecteurs demandent des tailles fixes — [WaveformResolution] — pour que les clés de cache
 * tombent juste : une bulle décode au moins 96 compartiments pour 72 barres, la bande de
 * transcription 512, le rogneur 2 048.
 */
@Singleton
class WaveformRepository @Inject constructor(
    private val cache: WaveformCache,
    private val images: WaveformImageRenderer,
) {

    /** La mesure brute (RMS absolu, échelle décibel à l'affichage) de l'audio à [location]. */
    suspend fun measured(location: String, count: Int = WaveformResolution.DEFAULT): List<Float> =
        cache.samples(WaveformLocation.parse(location), count)

    /** La mesure brute d'un audio en mémoire. */
    suspend fun measured(data: ByteArray, count: Int = WaveformResolution.DEFAULT): List<Float> =
        cache.samples(data, count)

    /**
     * Les niveaux à dessiner, normalisés au pic. Des niveaux [recorded] (relevés à l'enregistrement
     * du message) sont réutilisés tels quels, sans décoder ; sinon l'audio est mesuré en [count]
     * compartiments. Rien de lisible rend [WaveformLevels.Unavailable] — jamais une exception.
     */
    suspend fun levels(location: String, count: Int, recorded: List<Float> = emptyList()): WaveformLevels {
        if (recorded.isNotEmpty()) {
            return WaveformLevels(WaveformScale.peakNormalized(recorded), WaveformLevels.Origin.RECORDED)
        }
        val measured = measured(location, count)
        if (measured.isEmpty()) return WaveformLevels.Unavailable
        return WaveformLevels(WaveformScale.peakNormalized(measured), WaveformLevels.Origin.DECODED)
    }

    /** Les niveaux d'une bulle de [barCount] barres : au moins 96 compartiments sont demandés. */
    suspend fun bubbleLevels(location: String, barCount: Int, recorded: List<Float> = emptyList()): WaveformLevels =
        levels(location, WaveformResolution.bubbleRequest(barCount), recorded)

    /** L'image PNG d'une vignette audio ; vide quand l'audio n'est pas lisible. */
    suspend fun thumbnailPng(location: String, width: Int = THUMBNAIL_WIDTH, height: Int = THUMBNAIL_HEIGHT): ByteArray {
        val measured = measured(location, width)
        if (measured.isEmpty()) return ByteArray(0)
        return images.render(measured, width, height)
    }

    /** Vide la mémoire et le disque (déconnexion). */
    suspend fun clearAll() {
        cache.clearAll()
    }

    companion object {
        const val THUMBNAIL_WIDTH: Int = 64
        const val THUMBNAIL_HEIGHT: Int = 32
    }
}
