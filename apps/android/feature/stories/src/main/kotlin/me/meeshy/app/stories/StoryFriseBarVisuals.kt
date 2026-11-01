package me.meeshy.app.stories

/**
 * **Ce qu'une barre de frise MONTRE** (#14220, iso iOS `ComposerSceneFriseBarContent`, #14214) : une vidéo posée y
 * déroule les vignettes de sa source, un son sa forme d'onde. Une vidéo dont le fichier n'est pas encore connu, un son
 * sans échantillons, ou toute autre famille ne montrent que leur couleur.
 */
internal sealed interface FriseBarVisual {
    data class Filmstrip(val url: String, val sourceSeconds: Double) : FriseBarVisual
    data class Waveform(val samples: List<Float>) : FriseBarVisual
}

internal fun StoryComposerUiState.friseBarVisuals(): Map<String, FriseBarVisual> {
    val slide = deck.selectedSlide
    val videos = slide.placedMedia.mapNotNull { placed ->
        val seconds = placedTrimSourceOf(placed.id) ?: return@mapNotNull null
        val file = attachments.firstOrNull { it.id == slide.mediaFileOf(placed.id) } ?: return@mapNotNull null
        placed.id to FriseBarVisual.Filmstrip(file.url, seconds)
    }
    val sounds = slide.audio.filter { it.isBackground != true && it.waveformSamples.isNotEmpty() }
        .map { it.id to FriseBarVisual.Waveform(it.waveformSamples) }
    return (videos + sounds).toMap()
}
