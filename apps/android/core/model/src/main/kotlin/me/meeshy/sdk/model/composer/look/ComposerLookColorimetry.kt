package me.meeshy.sdk.model.composer.look

import me.meeshy.sdk.model.call.VideoFilterConfig
import me.meeshy.sdk.model.call.VideoFilterPreset
import me.meeshy.sdk.model.scene.SceneLookParams
import me.meeshy.sdk.model.scene.SceneLookRecipe

/**
 * **LA COLORIMÉTRIE D'UN FILTRE DE L'APPEL, POSÉE SUR UNE PRISE** (#9295) — le même préréglage que le flux
 * d'appel ([VideoFilterPreset.config]), traduit en UNE recette de couleur ([SceneLookRecipe]) que le rendu
 * de l'éditeur sait déjà peindre : température en kelvin, puis exposition, luminosité, contraste et
 * saturation. Aucune jumelle de filtre : la retouche lit le préréglage de l'appel.
 */
public object ComposerLookColorimetry {

    public fun recipe(preset: VideoFilterPreset): SceneLookRecipe = recipe(preset.config)

    public fun recipe(config: VideoFilterConfig): SceneLookRecipe {
        if (!config.isEnabled) return SceneLookRecipe.NEUTRAL
        return SceneLookRecipe(
            filterTemperatureKelvin = config.temperature,
            params = SceneLookParams(
                exposure = config.exposure,
                brightness = config.brightness,
                contrast = config.contrast,
                saturation = config.saturation,
            ),
        )
    }

    /** Un filtre ne coûte une passe que s'il change quelque chose. */
    public fun grades(preset: VideoFilterPreset): Boolean = !recipe(preset).isNeutral
}
