package me.meeshy.app.calls

import com.google.common.truth.Truth.assertThat
import java.util.Date
import java.util.Locale
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.model.ApiConversation
import me.meeshy.sdk.model.ApiConversationPreferences
import me.meeshy.sdk.model.call.frames.CallFrameCallContext
import org.junit.Test

class CallFrameTextsResolverTest {
    private val day = Date(1_793_000_000_000)

    private fun resolver(conversation: ApiConversation?) =
        CallFrameTextsResolver({ id -> conversation?.takeIf { it.id == id } }, { day }, { Locale.FRANCE })

    @Test
    fun `sans conversation en cache, le cadre ecrit ce que l appel sait deja et la date du jour`() = runTest {
        val texts = resolver(null).texts(CallFrameCallContext("c1", knownGroupTitle = "Famille", isGroupCall = true))
        assertThat(texts.groupName).isEqualTo("Famille")
        assertThat(texts.isGroup).isTrue()
        assertThat(texts.date).isNotEmpty()
        assertThat(texts.accentHex).isNull()
    }

    @Test
    fun `la conversation en cache donne son nom personnel, son type et son accent`() = runTest {
        val group = ApiConversation(
            id = "c1",
            type = "group",
            title = "Équipe",
            userPreferences = listOf(ApiConversationPreferences(customName = "Les copains")),
        )
        val texts = resolver(group).texts(CallFrameCallContext("c1", knownGroupTitle = null, isGroupCall = false))
        assertThat(texts.groupName).isEqualTo("Les copains")
        assertThat(texts.isGroup).isTrue()
        assertThat(texts.accentHex?.primary).startsWith("#")
    }

    @Test
    fun `un tete-a-tete ne porte pas de nom de groupe`() = runTest {
        val direct = ApiConversation(id = "c1", type = "direct", title = "Bob")
        val texts = resolver(direct).texts(CallFrameCallContext("c1", knownGroupTitle = null, isGroupCall = false))
        assertThat(texts.groupName).isNull()
        assertThat(texts.isGroup).isFalse()
    }

    @Test
    fun `sans identifiant de conversation, rien n est lu`() = runTest {
        var reads = 0
        val resolver = CallFrameTextsResolver({ reads++; null }, { day }, { Locale.FRANCE })
        resolver.texts(CallFrameCallContext(null, knownGroupTitle = null, isGroupCall = false))
        assertThat(reads).isEqualTo(0)
    }
}
