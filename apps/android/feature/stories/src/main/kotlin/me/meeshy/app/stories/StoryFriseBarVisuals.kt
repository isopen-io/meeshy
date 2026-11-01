package me.meeshy.app.stories

import kotlin.math.roundToInt
import me.meeshy.sdk.model.StoryAudioPlayerObject
import me.meeshy.sdk.model.composer.sound.SoundTrimLaw

/**
 * **Ce qu'une barre de frise MONTRE** (#14220, iso iOS `ComposerSceneFriseBarContent`, #14214) : une vidéo posée y
 * déroule les vignettes de sa source, un son sa forme d'onde. Une vidéo dont le fichier n'est pas encore connu, un son
 * sans échantillons, ou toute autre famille ne montrent que leur couleur.
 */
internal sealed interface FriseBarVisual {
    /** Les vignettes de la seule FENÊTRE coupée de la source, de [startSeconds] à [endSeconds] (#14268). */
    data class Filmstrip(val url: String, val startSeconds: Double, val endSeconds: Double) : FriseBarVisual
    data class Waveform(val samples: List<Float>) : FriseBarVisual
}

internal fun StoryComposerUiState.friseBarVisuals(): Map<String, FriseBarVisual> {
    val slide = deck.selectedSlide
    val videos = slide.placedMedia.mapNotNull { placed ->
        val kept = placedTrimOf(placed.id) ?: return@mapNotNull null
        val file = attachments.firstOrNull { it.id == slide.mediaFileOf(placed.id) } ?: return@mapNotNull null
        placed.id to FriseBarVisual.Filmstrip(file.url, kept.start, kept.end)
    }
    val sounds = slide.audio.filter { it.isBackground != true && it.waveformSamples.isNotEmpty() }
        .map { sound -> sound.id to FriseBarVisual.Waveform(keptSamples(sound)) }
    return (videos + sounds).toMap()
}

/** La forme d'onde de la seule fenêtre gardée (#14268) ; une source de durée inconnue se montre entière. */
private fun StoryComposerUiState.keptSamples(sound: StoryAudioPlayerObject): List<Float> {
    val source = trimSourceOf(sound) ?: return sound.waveformSamples
    val kept = SoundTrimLaw.window(sound, source)
    return FriseWaveWindow.slice(sound.waveformSamples, kept.start / source, kept.end / source)
}

internal object FriseWaveWindow {
    /** Les échantillons de [samples] entre les fractions [from] et [to] de la source, au moins un. Pure. */
    fun slice(samples: List<Float>, from: Double, to: Double): List<Float> {
        if (samples.isEmpty()) return samples
        val first = (from.coerceIn(0.0, 1.0) * samples.size).roundToInt().coerceAtMost(samples.size - 1)
        val last = (to.coerceIn(0.0, 1.0) * samples.size).roundToInt().coerceIn(first + 1, samples.size)
        return samples.subList(first, last)
    }
}
