package me.meeshy.sdk.model.preview

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class PreviewTruncationTest {

    @Test
    fun `un texte plus court que le plafond reste intact`() {
        assertThat("Bonjour".previewTruncated()).isEqualTo("Bonjour")
    }

    @Test
    fun `le plafond compte des graphemes et non des unites UTF-16`() {
        val text = "a".repeat(LAST_MESSAGE_PREVIEW_MAX_LENGTH + 50)

        assertThat(text.previewTruncated()).hasLength(LAST_MESSAGE_PREVIEW_MAX_LENGTH)
    }

    @Test
    fun `un emoji a sequence ZWJ n'est jamais coupe en deux`() {
        val family = "👨‍👩‍👧"

        assertThat((family + family + family).truncatedToGraphemes(2)).isEqualTo(family + family)
        assertThat((family + family).truncatedToGraphemes(1)).isEqualTo(family)
    }

    @Test
    fun `un drapeau reste une paire de regional indicators entiere`() {
        val flags = "🇫🇷🇩🇪🇬🇧"

        assertThat(flags.truncatedToGraphemes(2)).isEqualTo("🇫🇷🇩🇪")
    }

    @Test
    fun `une lettre accentuee decomposee garde son diacritique`() {
        val decomposed = "ééé"

        assertThat(decomposed.truncatedToGraphemes(2)).isEqualTo("éé")
    }

    @Test
    fun `une conjonction devanagari consonne virama consonne reste entiere`() {
        val conjunct = "क्ष"
        val text = conjunct + "ा" + conjunct

        assertThat((text + text).truncatedToGraphemes(2)).isEqualTo(text)
    }

    @Test
    fun `un plafond nul ou negatif rend la chaine vide`() {
        assertThat("abc".truncatedToGraphemes(0)).isEmpty()
    }
}
