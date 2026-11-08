package me.meeshy.sdk.model.scene

import me.meeshy.sdk.model.composer.scene.StoryBackdrop
import me.meeshy.sdk.model.composer.scene.StoryFitMode
import kotlin.math.max

/**
 * Ce qui remplit les bandes d'un fond AJUSTÉ (iOS `StoryLetterboxFill` + `refreshLetterboxFill`). Les bandes n'existent
 * qu'en mode ajusté ; une teinte choisie les peint pleines sans rien attendre ; le flou se tire du bitmap déjà posé (exact),
 * sinon du ThumbHash (démarrage à froid), réduit à [LONG_EDGE] px puis étiré — c'est cette finesse qui fait le flou.
 */
object SceneBackdropChoice {
    const val LONG_EDGE: Int = 32
    const val FILL_OPACITY: Float = 0.85f

    sealed interface Source {
        data object StampedBitmap : Source
        data class ThumbHash(val hash: String) : Source
        data object None : Source
    }

    sealed interface Choice {
        data object Nothing : Choice
        data class Solid(val hex: String) : Choice
        data class Blur(val source: Source) : Choice
    }

    fun source(hasStampedBitmap: Boolean, hashes: List<String>): Source = when {
        hasStampedBitmap -> Source.StampedBitmap
        else -> hashes.firstOrNull { it.isNotEmpty() }?.let { Source.ThumbHash(it) } ?: Source.None
    }

    /** Le drapeau de service : seule la valeur `fit`, avec de quoi peindre, laisse une bande à habiller. */
    fun isServed(fitMode: String?, hasSource: Boolean): Boolean = fitMode == StoryFitMode.FIT && hasSource

    /**
     * [suppressed] : l'hôte ne présente que le rectangle de l'image, la bande sort du cadre — rien n'est peint.
     */
    fun choose(
        fitMode: String?,
        backdrop: StoryBackdrop,
        hasStampedBitmap: Boolean,
        hashes: List<String>,
        suppressed: Boolean = false,
    ): Choice {
        if (suppressed) return Choice.Nothing
        backdrop.solidHex?.takeIf { fitMode == StoryFitMode.FIT }?.let { return Choice.Solid(it) }
        val source = source(hasStampedBitmap, hashes)
        return if (isServed(fitMode, source != Source.None)) Choice.Blur(source) else Choice.Nothing
    }

    /** La taille du bitmap réduit au grain de la bande : côté long [LONG_EDGE], jamais agrandi, au moins 1 px. */
    fun downsampledSize(width: Int, height: Int): Pair<Int, Int>? {
        val edge = max(width, height)
        if (width <= 0 || height <= 0) return null
        val factor = minOf(1.0, LONG_EDGE.toDouble() / edge)
        return max(1, (width * factor).toInt()) to max(1, (height * factor).toInt())
    }
}
