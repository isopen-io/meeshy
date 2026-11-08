package me.meeshy.app.widget

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class QuickReplyDraftsTest {

    private val device = QuickReplyTexts(thumbsUp = "👍", ok = "OK", thanks = "Thanks!", callMe = "Call me")
    private val account = QuickReplyTexts(thumbsUp = "👍", ok = "OK", thanks = "Merci !", callMe = "Appelle-moi")

    @Test
    fun `le brouillon suit la langue du compte tandis que le libelle suit l'appareil`() {
        val chips = QuickReplyDrafts.chips(labels = device, drafts = account)

        assertThat(chips.map { it.label }).containsExactly("👍", "OK", "Thanks!", "Call me").inOrder()
        assertThat(chips.map { it.draft }).containsExactly("👍", "OK", "Merci !", "Appelle-moi").inOrder()
    }

    @Test
    fun `sans langue de compte exploitable le brouillon retombe sur le libelle`() {
        val chips = QuickReplyDrafts.chips(labels = device, drafts = null)

        assertThat(chips.map { it.draft }).isEqualTo(chips.map { it.label })
    }

    @Test
    fun `la langue du compte est le premier rang du prisme que les widgets savent ecrire`() {
        assertThat(QuickReplyDrafts.draftLanguage(listOf("fr", "en"))).isEqualTo("fr")
    }

    @Test
    fun `une region ou une casse differente se ramene a la langue de base`() {
        assertThat(QuickReplyDrafts.draftLanguage(listOf("pt-BR"))).isEqualTo("pt")
        assertThat(QuickReplyDrafts.draftLanguage(listOf("FR_ca"))).isEqualTo("fr")
    }

    @Test
    fun `une langue non traduite cede au rang suivant du prisme`() {
        assertThat(QuickReplyDrafts.draftLanguage(listOf("ja", "es"))).isEqualTo("es")
    }

    @Test
    fun `aucune langue exploitable rend null`() {
        assertThat(QuickReplyDrafts.draftLanguage(emptyList())).isNull()
        assertThat(QuickReplyDrafts.draftLanguage(listOf("ja", "ko"))).isNull()
    }
}
