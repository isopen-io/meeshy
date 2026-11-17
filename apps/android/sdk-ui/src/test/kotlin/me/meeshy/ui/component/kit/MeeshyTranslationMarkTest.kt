package me.meeshy.ui.component.kit

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/** K51 — la marque de traduction annonce ce que l'hôte rend et ne résout rien. */
class MeeshyTranslationMarkTest {

    private fun resolve(
        density: MeeshyTranslationMarkDensity = MeeshyTranslationMarkDensity.Line,
        mode: MeeshyTranslationMarkMode = MeeshyTranslationMarkMode.Translated,
        hasToggle: Boolean = true,
        isPressed: Boolean = false,
        isPending: Boolean = false,
        widthDp: Float = 390f,
        reduceMotion: Boolean = false,
    ) = MeeshyTranslationMarkRecipe.resolve(density, mode, hasToggle, isPressed, isPending, widthDp, reduceMotion)

    @Test
    fun `l'icone seule ne dit pas de mot et ne bascule pas`() {
        val icon = resolve(density = MeeshyTranslationMarkDensity.Icon)
        assertThat(icon.showsMention).isFalse()
        assertThat(icon.showsToggle).isFalse()
        assertThat(resolve().showsMention).isTrue()
    }

    @Test
    fun `l'annonce d'avant l'envoi n'a pas de bascule`() {
        assertThat(resolve(mode = MeeshyTranslationMarkMode.Announce).showsToggle).isFalse()
        assertThat(resolve(hasToggle = false).showsToggle).isFalse()
        assertThat(resolve().showsToggle).isTrue()
    }

    @Test
    fun `sous 320 de large le point s'en va et la bascule passe sous la mention`() {
        val narrow = resolve(widthDp = 300f)
        assertThat(narrow.wrapsToggle).isTrue()
        assertThat(narrow.showsSeparator).isFalse()
        val wide = resolve(widthDp = 320f)
        assertThat(wide.wrapsToggle).isFalse()
        assertThat(wide.showsSeparator).isTrue()
        assertThat(resolve(widthDp = 300f, hasToggle = false).wrapsToggle).isFalse()
    }

    @Test
    fun `les mesures - glyphe 16, texte 12,5 ou 13 a l'annonce, graisses 400 et 700, cible 44`() {
        val v = resolve()
        assertThat(v.glyphSizeDp).isEqualTo(16f)
        assertThat(v.textSizeSp).isEqualTo(12.5f)
        assertThat(resolve(mode = MeeshyTranslationMarkMode.Announce).textSizeSp).isEqualTo(13f)
        assertThat(v.mentionWeight).isEqualTo(400)
        assertThat(v.toggleWeight).isEqualTo(700)
        assertThat(v.separatorSpacingDp).isEqualTo(7f)
        assertThat(v.tapTargetDp).isEqualTo(44f)
    }

    @Test
    fun `l'original est servi - le glyphe s'eteint`() {
        assertThat(resolve(mode = MeeshyTranslationMarkMode.Original).glyphIsMuted).isTrue()
        assertThat(resolve(mode = MeeshyTranslationMarkMode.Translated).glyphIsMuted).isFalse()
    }

    @Test
    fun `presse la bascule descend a 0,94 et son encre a 62 pour cent - rien sans bascule`() {
        val pressed = resolve(isPressed = true)
        assertThat(pressed.toggleScale).isEqualTo(0.94f)
        assertThat(pressed.toggleInkOpacity).isEqualTo(0.62f)
        assertThat(resolve(isPressed = true, hasToggle = false).toggleScale).isEqualTo(1f)
        assertThat(resolve().toggleScale).isEqualTo(1f)
    }

    @Test
    fun `en attente la bascule s'eteint a 50 pour cent et ne recoit plus rien`() {
        val pending = resolve(isPending = true)
        assertThat(pending.toggleOpacity).isEqualTo(0.5f)
        assertThat(pending.acceptsToggle).isFalse()
        assertThat(resolve().acceptsToggle).isTrue()
        assertThat(resolve().toggleOpacity).isEqualTo(1f)
    }

    @Test
    fun `le fondu enchaine dure 200 ms et rien en mouvement reduit`() {
        assertThat(resolve().crossfadeMillis).isEqualTo(200)
        assertThat(resolve(reduceMotion = true).crossfadeMillis).isEqualTo(0)
    }

    @Test
    fun `le mode se deduit du booleen de l'hote et l'annonce se passe explicitement`() {
        assertThat(MeeshyTranslationMarkRecipe.resolveMode(null, isShowingOriginal = true)).isEqualTo(MeeshyTranslationMarkMode.Original)
        assertThat(MeeshyTranslationMarkRecipe.resolveMode(null, isShowingOriginal = false)).isEqualTo(MeeshyTranslationMarkMode.Translated)
        assertThat(MeeshyTranslationMarkRecipe.resolveMode(MeeshyTranslationMarkMode.Announce, isShowingOriginal = true))
            .isEqualTo(MeeshyTranslationMarkMode.Announce)
    }

    @Test
    fun `la mention porte le nom de langue donne par l'hote et ne le recompose jamais`() {
        val words = MeeshyTranslationMarkWords(
            translated = "Traduit",
            translatedFrom = { "Traduit de $it" },
            original = "Original",
            originalFrom = { "Original en $it" },
            showTranslation = "Voir la traduction",
            showOriginal = "Voir l'original",
            valueOriginal = "original affiché",
            valueTranslated = "traduction affichée",
        )
        assertThat(words.mention(MeeshyTranslationMarkMode.Translated, "l'italien")).isEqualTo("Traduit de l'italien")
        assertThat(words.mention(MeeshyTranslationMarkMode.Original, "italien")).isEqualTo("Original en italien")
        assertThat(words.mention(MeeshyTranslationMarkMode.Translated, null)).isEqualTo("Traduit")
        assertThat(words.mention(MeeshyTranslationMarkMode.Original, "")).isEqualTo("Original")
        assertThat(words.toggle(MeeshyTranslationMarkMode.Translated)).isEqualTo("Voir l'original")
        assertThat(words.toggle(MeeshyTranslationMarkMode.Original)).isEqualTo("Voir la traduction")
        assertThat(words.toggleValue(MeeshyTranslationMarkMode.Original)).isEqualTo("original affiché")
        assertThat(words.toggleValue(MeeshyTranslationMarkMode.Translated)).isEqualTo("traduction affichée")
    }
}
