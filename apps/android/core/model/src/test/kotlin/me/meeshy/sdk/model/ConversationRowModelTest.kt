package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class ConversationRowModelTest {

    private fun conv(
        title: String? = null,
        identifier: String? = null,
        customName: String? = null,
        isActive: Boolean? = null,
    ) = ApiConversation(
        id = "c1",
        title = title,
        identifier = identifier,
        isActive = isActive,
        preferences = customName?.let { ApiConversationPreferences(customName = it) },
    )

    @Test
    fun `le nom personnalise passe avant le titre`() {
        assertThat(ConversationRowModel.of(conv(title = "T", customName = "Perso")).displayName).isEqualTo("Perso")
    }

    @Test
    fun `sans nom personnalise le titre passe avant l identifiant`() {
        assertThat(ConversationRowModel.of(conv(title = "T", identifier = "mshy_x")).displayName).isEqualTo("T")
    }

    @Test
    fun `sans titre le nom est l identifiant puis l id`() {
        assertThat(ConversationRowModel.of(conv(identifier = "mshy_x")).displayName).isEqualTo("mshy_x")
        assertThat(ConversationRowModel.of(conv()).displayName).isEqualTo("c1")
    }

    @Test
    fun `une conversation inactive est archivee`() {
        assertThat(ConversationRowModel.of(conv(isActive = false)).isArchived).isTrue()
        assertThat(ConversationRowModel.of(conv(isActive = true)).isArchived).isFalse()
        assertThat(ConversationRowModel.of(conv()).isArchived).isFalse()
    }

    @Test
    fun `World Wide est reconnu par son identifiant`() {
        assertThat(ConversationRowModel.of(conv(identifier = "world")).isWorldWide).isTrue()
        assertThat(ConversationRowModel.of(conv(identifier = "worldwide")).isWorldWide).isFalse()
    }

    @Test
    fun `l effectif plafonne se rend 199 plus`() {
        val c = ApiConversation(id = "g", serverMemberCount = 199, memberCountCapped = true)
        assertThat(ConversationRowModel.of(c).memberCountDisplay).isEqualTo("199+")
    }
}
