package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class CommunityCreateFormTest {
    @Test
    fun `the catalogue offers fifteen distinct emojis`() {
        assertThat(CommunityCreateForm.POPULAR_EMOJIS).hasSize(15)
        assertThat(CommunityCreateForm.POPULAR_EMOJIS.toSet()).hasSize(15)
    }

    @Test
    fun `the name is trimmed and mandatory`() {
        assertThat(CommunityCreateDraft().withName("  Club  ").toRequest().name).isEqualTo("Club")
        assertThat(CommunityCreateDraft().withName("   ").isValid).isFalse()
    }

    @Test
    fun `an empty identifier and description are omitted from the request`() {
        val request = CommunityCreateDraft().withName("Club").copy(description = "  ").toRequest()
        assertThat(request.identifier).isNull()
        assertThat(request.description).isNull()
    }

    @Test
    fun `a community is private by default`() {
        assertThat(CommunityCreateDraft().isPrivate).isTrue()
    }

    @Test
    fun `the identifier is typed in lowercase behind the fixed prefix`() {
        assertThat(CommunityCreateDraft.IDENTIFIER_PREFIX).isEqualTo("mshy_")
        assertThat(CommunityCreateDraft().withIdentifier("Mon-Club").identifier).isEqualTo("mon-club")
    }

    @Test
    fun `an empty name seeds the accent with New`() {
        assertThat(CommunityCreateForm.EMPTY_ACCENT_SEED).isEqualTo("New")
    }
}
