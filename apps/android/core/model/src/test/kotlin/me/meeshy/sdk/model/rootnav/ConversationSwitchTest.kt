package me.meeshy.sdk.model.rootnav

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class ConversationSwitchTest {

    @Test
    fun `ouvrir B alors que A est affichee remplace la pile et detruit la vue de A pour vider son brouillon`() {
        val plan = ConversationSwitch.plan(displayedConversationId = "A", targetId = "B")
        assertThat(plan.replacesStack).isTrue()
        assertThat(plan.teardownConversationId).isEqualTo("A")
        assertThat(plan.reusesCurrentScreen).isFalse()
    }

    @Test
    fun `ouvrir une conversation depuis la liste ne detruit aucune vue`() {
        val plan = ConversationSwitch.plan(displayedConversationId = null, targetId = "B")
        assertThat(plan.replacesStack).isTrue()
        assertThat(plan.teardownConversationId).isNull()
    }

    @Test
    fun `rouvrir la conversation affichee reutilise sa vue sans vider son brouillon`() {
        val plan = ConversationSwitch.plan(displayedConversationId = "A", targetId = "A")
        assertThat(plan.reusesCurrentScreen).isTrue()
        assertThat(plan.teardownConversationId).isNull()
        assertThat(plan.replacesStack).isFalse()
    }

    @Test
    fun `le contexte de reponse et le mode force sont consommes puis remis a nul`() {
        val context = ConversationRouteContext<String, String>()
        context.arm(reply = "msg-1", mode = "original")
        assertThat(context.consumeOnArrival()).isEqualTo("msg-1" to "original")
        assertThat(context.consumeOnArrival()).isEqualTo(null to null)
    }

    @Test
    fun `armer sans contexte efface un contexte perime`() {
        val context = ConversationRouteContext<String, String>()
        context.arm(reply = "msg-1", mode = "original")
        context.arm()
        assertThat(context.consumeOnArrival()).isEqualTo(null to null)
    }
}
