package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class ConversationWriteRestrictionTest {

    @Test
    fun `minor-global closes the composer and imposes the archive`() {
        val restriction = ConversationWriteRestriction.fromWire("minor-global")
        assertThat(restriction).isEqualTo(ConversationWriteRestriction.MinorGlobal)
        assertThat(restriction.closesComposer).isTrue()
        assertThat(restriction.imposesArchive).isTrue()
    }

    @Test
    fun `an unknown value is kept and tolerated, it neither closes the composer nor imposes the archive`() {
        val restriction = ConversationWriteRestriction.fromWire("under-review")
        assertThat(restriction).isEqualTo(ConversationWriteRestriction.Unknown("under-review"))
        assertThat(restriction.wireValue).isEqualTo("under-review")
        assertThat(restriction.closesComposer).isFalse()
        assertThat(restriction.imposesArchive).isFalse()
        assertThat(restriction.declaresMinor).isFalse()
    }

    @Test
    fun `a GLOBAL_ADULTS_ONLY refusal reveals the minor-global restriction and nothing else does`() {
        assertThat(ConversationWriteRestriction.fromRefusalCode("GLOBAL_ADULTS_ONLY"))
            .isEqualTo(ConversationWriteRestriction.MinorGlobal)
        assertThat(ConversationWriteRestriction.fromRefusalCode("FORBIDDEN")).isNull()
        assertThat(ConversationWriteRestriction.fromRefusalCode(null)).isNull()
    }

    @Test
    fun `only minor-global declares a minor for the action law`() {
        val none: ConversationWriteRestriction? = null
        assertThat(none.declaresMinor).isFalse()
        assertThat(ConversationWriteRestriction.MinorGlobal.declaresMinor).isTrue()
    }

    @Test
    fun `the archive is imposed only on a conversation served with minor-global`() {
        val global = ApiConversation(id = "meeshy", type = "global")
        assertThat(global.isArchiveImposed).isFalse()
        assertThat(global.copy(viewerWriteRestriction = ConversationWriteRestriction.MinorGlobal).isArchiveImposed).isTrue()
        assertThat(global.copy(viewerWriteRestriction = ConversationWriteRestriction.Unknown("x")).isArchiveImposed).isFalse()
    }
}
