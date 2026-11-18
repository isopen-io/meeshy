package me.meeshy.sdk.model.call

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.socket.SocketEventNames
import org.junit.Test

/**
 * `call:conversation-changed` (#19650) : la charge réelle de la passerelle (`CallConversationChangedEvent`,
 * `packages/shared/types/call-controls.ts`), clé par clé, traverse le vrai décodeur.
 */
class CallConversationChangedParserTest {

    private val full =
        """{"callId":"call-1","conversationId":"group-1","previousConversationId":"direct-1","conversationType":"group",""" +
            """"conversationTitle":"Ada, Bruno, Chloé","memberUserIds":["ada","bruno","chloe"],"created":true,"reason":"invitation"}"""

    @Test
    fun `le nom du fil est celui du contrat`() {
        assertThat(SocketEventNames.CALL_CONVERSATION_CHANGED).isEqualTo("call:conversation-changed")
        assertThat(SocketEventNames.all).contains("call:conversation-changed")
    }

    @Test
    fun `une charge complete se decode entiere`() {
        assertThat(CallSocialEventParser.conversationChanged(full)).isEqualTo(
            CallConversationChanged(
                callId = "call-1",
                conversationId = "group-1",
                previousConversationId = "direct-1",
                conversationType = "group",
                conversationTitle = "Ada, Bruno, Chloé",
                memberUserIds = listOf("ada", "bruno", "chloe"),
                created = true,
            ),
        )
    }

    @Test
    fun `un titre nul, des membres absents et une cle inconnue ne bloquent rien`() {
        val event = CallSocialEventParser.conversationChanged(
            """{"callId":"c","conversationId":"g","previousConversationId":"d","conversationType":"group","conversationTitle":null,"created":false,"future":1}""",
        )
        assertThat(event?.conversationTitle).isNull()
        assertThat(event?.memberUserIds).isEmpty()
        assertThat(event?.created).isFalse()
    }

    @Test
    fun `une charge malformee ou sans appel ni conversation est ignoree`() {
        assertThat(CallSocialEventParser.conversationChanged("not json")).isNull()
        assertThat(CallSocialEventParser.conversationChanged("""{"conversationId":"g"}""")).isNull()
        assertThat(CallSocialEventParser.conversationChanged("""{"callId":"c","conversationId":""}""")).isNull()
        assertThat(CallSocialEventParser.conversationChanged("""{"callId":"c","conversationId":42}""")).isNull()
    }
}
