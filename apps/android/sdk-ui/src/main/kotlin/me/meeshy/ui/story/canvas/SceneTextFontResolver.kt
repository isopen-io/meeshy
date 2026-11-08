package me.meeshy.ui.story.canvas

import androidx.compose.ui.text.font.Font
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.font.FontWeight
import me.meeshy.sdk.model.scene.StoryTextFace
import me.meeshy.sdk.model.scene.StoryTextFontSpec
import me.meeshy.sdk.model.scene.StoryTextFontSpecs
import me.meeshy.ui.R

/** La police Compose d'un texte de scène : face du style, poids d'auteur appliqué, pente et espacement (iOS `StoryTextFontResolver`). */
internal data class SceneTextFont(
    val family: FontFamily,
    val weight: FontWeight,
    val style: FontStyle,
    val letterSpacingEm: Float,
)

public object SceneTextFontResolver {
    internal fun resolve(styleWire: String?, weightWire: String?): SceneTextFont = resolve(StoryTextFontSpecs.resolve(styleWire, weightWire))

    internal fun resolve(spec: StoryTextFontSpec): SceneTextFont = SceneTextFont(
        family = familyOf(spec.face),
        weight = FontWeight(spec.fontWeight),
        style = if (spec.italic) FontStyle.Italic else FontStyle.Normal,
        letterSpacingEm = spec.letterSpacingEm,
    )

    public fun familyOf(face: StoryTextFace): FontFamily = when (face) {
        StoryTextFace.SYSTEM_SANS -> FontFamily.SansSerif
        StoryTextFace.SYSTEM_SERIF -> FontFamily.Serif
        StoryTextFace.SYSTEM_MONOSPACE -> FontFamily.Monospace
        StoryTextFace.SYSTEM_SERIF_MONOSPACE -> FontFamily.Monospace
        StoryTextFace.NUNITO -> embedded(R.font.nunito)
        StoryTextFace.COURIER_PRIME -> embedded(R.font.story_courier_prime)
        StoryTextFace.HANDLEE -> embedded(R.font.story_handlee)
        StoryTextFace.MARCK_SCRIPT -> embedded(R.font.story_marck_script)
        StoryTextFace.BANGERS -> embedded(R.font.story_bangers)
        StoryTextFace.ORBITRON -> embedded(R.font.story_orbitron)
        StoryTextFace.MACONDO -> embedded(R.font.story_macondo)
        StoryTextFace.SACRAMENTO -> embedded(R.font.story_sacramento)
        StoryTextFace.GOCHI_HAND -> embedded(R.font.story_gochi_hand)
        StoryTextFace.ABRIL_FATFACE -> embedded(R.font.story_abril_fatface)
        StoryTextFace.BEBAS_NEUE -> embedded(R.font.story_bebas_neue)
        StoryTextFace.ARCHITECTS_DAUGHTER -> embedded(R.font.story_architects_daughter)
        StoryTextFace.COURGETTE -> embedded(R.font.story_courgette)
    }

    private fun embedded(resId: Int): FontFamily = FontFamily(Font(resId))
}
