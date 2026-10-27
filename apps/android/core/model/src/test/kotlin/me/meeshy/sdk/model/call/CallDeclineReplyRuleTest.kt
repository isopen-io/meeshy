package me.meeshy.sdk.model.call

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class CallDeclineReplyRuleTest {
    private fun plan(
        declinable: Boolean = true,
        conversationId: String? = "conv1",
        text: String = "Je te rappelle.",
        language: String? = "fr",
    ) = CallDeclineReplyRule.plan(declinable, conversationId, text, language)

    @Test
    fun `un appel sonnant avec un texte donne un plan vers sa conversation`() {
        assertThat(plan()).isEqualTo(CallDeclineReplyPlan("conv1", "Je te rappelle.", "fr"))
    }

    @Test
    fun `un appel non refusable ne produit aucun plan`() {
        assertThat(plan(declinable = false)).isNull()
    }

    @Test
    fun `sans conversation connue rien ne part`() {
        assertThat(plan(conversationId = null)).isNull()
        assertThat(plan(conversationId = "  ")).isNull()
    }

    @Test
    fun `un texte vide ou blanc ne part pas`() {
        assertThat(plan(text = "")).isNull()
        assertThat(plan(text = " \n\t ")).isNull()
    }

    @Test
    fun `le texte est rogne puis borne a 500 caracteres`() {
        val long = "  " + "a".repeat(600) + "  "
        assertThat(plan(text = long)!!.content.length).isEqualTo(500)
        assertThat(plan(text = "  salut \n")!!.content).isEqualTo("salut")
    }

    @Test
    fun `la langue absente reste absente`() {
        assertThat(plan(language = null)!!.originalLanguage).isNull()
    }

    @Test
    fun `le brouillon du champ libre est borne et le bouton suit son contenu`() {
        assertThat(CallDeclineReplyRule.clamp("b".repeat(700)).length).isEqualTo(500)
        assertThat(CallDeclineReplyRule.canSend("ok")).isTrue()
        assertThat(CallDeclineReplyRule.canSend("   ")).isFalse()
    }

    @Test
    fun `les reponses rapides gardent l'ordre de la feuille iOS`() {
        assertThat(CallDeclineQuickReply.entries.map { it.id })
            .containsExactly("callBack", "meeting", "cantTalk", "writeMe").inOrder()
    }
}
