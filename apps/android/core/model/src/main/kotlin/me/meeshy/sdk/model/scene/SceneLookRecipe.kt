package me.meeshy.sdk.model.scene

import me.meeshy.sdk.model.ImageAdjustments as WireAdjustments
import me.meeshy.sdk.model.StoryEffects
import me.meeshy.sdk.model.StoryFilter
import me.meeshy.sdk.model.imageedit.ImageEditState
import me.meeshy.sdk.model.imageedit.ImageEffect
import me.meeshy.sdk.model.imageedit.ImageFilter

/**
 * Tout ce qu'un rendu de couleur a besoin de savoir : le filtre, les réglages et l'effet, en UNE
 * valeur immuable. Miroir de la chaîne `StoryBackgroundLook.ciImage` (iOS) : le filtre, puis les
 * réglages, puis l'effet, dans un seul passage — l'aperçu, le lecteur et l'export lisent la même.
 */
data class SceneLookRecipe(
    val filterMatrix: StoryColorMatrix = StoryColorMatrix.IDENTITY,
    /** Cible en kelvin d'un filtre de température (Chaud 7800, Froid 5200) ; 6500 = aucun. */
    val filterTemperatureKelvin: Float = SceneLookMatrix.NEUTRAL_KELVIN,
    /** Vignette portée par le filtre lui-même (Dramatique) ; 0 = aucune. */
    val filterVignette: Float = 0f,
    val params: SceneLookParams = SceneLookParams.NEUTRAL,
    val effect: ImageEffect = ImageEffect.NONE,
) {
    val isNeutral: Boolean
        get() = filterMatrix == StoryColorMatrix.IDENTITY &&
            filterTemperatureKelvin == SceneLookMatrix.NEUTRAL_KELVIN &&
            filterVignette <= SceneLookParams.EPS &&
            params.isNeutral &&
            effect == ImageEffect.NONE

    /** Clé déterministe de la recette : deux recettes égales se signent pareil. */
    fun signature(): String =
        "${filterMatrix.values.joinToString(",")}|$filterTemperatureKelvin|$filterVignette|${params.signature()}|${effect.wireName}"

    companion object {
        val NEUTRAL: SceneLookRecipe = SceneLookRecipe()

        /** Le look d'une slide : son filtre de story à [intensity], puis les réglages du média. */
        fun forStory(
            filter: StoryFilter?,
            intensity: Float,
            adjustments: WireAdjustments?,
            isVideo: Boolean = false,
        ): SceneLookRecipe {
            val params = SceneLookParams.from(adjustments).let { if (isVideo) it.servedForVideo() else it }
            return SceneLookRecipe(
                filterMatrix = StoryFilterMatrix.effectiveMatrix(filter, intensity),
                params = params,
            )
        }

        /** Le filtre de slide, lu depuis son jeton de fil ; `null` si absent ou d'un client plus récent. */
        fun filterOf(effects: StoryEffects): StoryFilter? =
            effects.filter?.let { token -> StoryFilter.entries.firstOrNull { it.wireValue() == token } }

        /** Le look du FOND de ces effets : le filtre de slide, puis les réglages du média de fond. */
        fun forEffects(effects: StoryEffects?): SceneLookRecipe {
            if (effects == null) return NEUTRAL
            val background = effects.mediaObjects.orEmpty().firstOrNull { it.isBackground }
            return forStory(
                filter = filterOf(effects),
                intensity = (effects.filterIntensity ?: 1.0).toFloat(),
                adjustments = background?.adjustments,
                isVideo = background?.mediaType == "video",
            )
        }

        /** Le look complet d'un état d'éditeur d'image (filtre, réglages, effet). */
        fun forEdit(state: ImageEditState): SceneLookRecipe {
            val look = ImageFilterLooks.of(state.filter)
            return SceneLookRecipe(
                filterMatrix = look.matrix,
                filterTemperatureKelvin = look.temperatureKelvin,
                filterVignette = look.vignette,
                params = SceneLookParams.from(state.adjustments),
                effect = state.effect,
            )
        }
    }
}

/** Ce qu'un des douze filtres de l'éditeur ajoute à la chaîne. */
data class ImageFilterLook(
    val matrix: StoryColorMatrix = StoryColorMatrix.IDENTITY,
    val temperatureKelvin: Float = SceneLookMatrix.NEUTRAL_KELVIN,
    val vignette: Float = 0f,
)

/** Les douze filtres, miroir d'`ImageFilterEngine.filterStage` (iOS). */
object ImageFilterLooks {
    private const val WARM_KELVIN = 7800f
    private const val COOL_KELVIN = 5200f

    private fun matrix(vararg v: Float) = StoryColorMatrix(v.toList())

    private val gray = matrix(
        0.2125f, 0.7154f, 0.0721f, 0f, 0f,
        0.2125f, 0.7154f, 0.0721f, 0f, 0f,
        0.2125f, 0.7154f, 0.0721f, 0f, 0f,
        0f, 0f, 0f, 1f, 0f,
    )

    fun of(filter: ImageFilter): ImageFilterLook = when (filter) {
        ImageFilter.ORIGINAL -> ImageFilterLook()
        ImageFilter.VIVID -> ImageFilterLook(SceneLookMatrix.colorControls(0f, 1.15f, 1.5f))
        ImageFilter.DRAMATIC -> ImageFilterLook(SceneLookMatrix.colorControls(0f, 1.4f, 1f), vignette = 1.5f)
        ImageFilter.MONO -> ImageFilterLook(SceneLookMatrix.compose(gray, SceneLookMatrix.colorControls(0f, 1.05f, 1f)))
        ImageFilter.NOIR -> ImageFilterLook(SceneLookMatrix.compose(gray, SceneLookMatrix.colorControls(-0.03f, 1.35f, 1f)))
        ImageFilter.SEPIA -> ImageFilterLook(
            StoryColorMatrix.IDENTITY.blend(
                matrix(
                    0.393f, 0.769f, 0.189f, 0f, 0f,
                    0.349f, 0.686f, 0.168f, 0f, 0f,
                    0.272f, 0.534f, 0.131f, 0f, 0f,
                    0f, 0f, 0f, 1f, 0f,
                ),
                0.7f,
            ),
        )
        ImageFilter.WARM -> ImageFilterLook(temperatureKelvin = WARM_KELVIN)
        ImageFilter.COOL -> ImageFilterLook(temperatureKelvin = COOL_KELVIN)
        ImageFilter.FADE -> ImageFilterLook(StoryFilterMatrix.baseMatrix(StoryFilter.FADE))
        ImageFilter.CHROME -> ImageFilterLook(StoryFilterMatrix.baseMatrix(StoryFilter.CHROME))
        ImageFilter.PROCESS -> ImageFilterLook(
            matrix(
                0.95f, 0.05f, 0f, 0f, -6f,
                0f, 1.05f, 0.05f, 0f, -4f,
                0.05f, 0.1f, 0.85f, 0f, 22f,
                0f, 0f, 0f, 1f, 0f,
            ),
        )
        ImageFilter.INSTANT -> ImageFilterLook(
            matrix(
                1.1f, 0.05f, 0f, 0f, 8f,
                0f, 1.0f, 0.05f, 0f, 6f,
                0f, 0.05f, 0.85f, 0f, 12f,
                0f, 0f, 0f, 1f, 0f,
            ),
        )
    }
}
