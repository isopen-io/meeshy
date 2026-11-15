package me.meeshy.ui.component.bubble

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.lang.LanguageResolver
import me.meeshy.sdk.model.ApiMessage
import me.meeshy.sdk.model.BubbleRenderKind
import me.meeshy.sdk.model.EphemeralLifecycle
import org.junit.Test

private object FrenchReader : LanguageResolver.ContentLanguagePreferences {
    override val systemLanguage: String = "fr"
    override val regionalLanguage: String? = null
    override val customDestinationLanguage: String? = null
}

private fun viewOnce(viewOnceCount: Int, consumedByMe: Boolean?) = BubbleContentBuilder.build(
    ApiMessage(
        id = "m1",
        conversationId = "c1",
        senderId = "other",
        content = "secret",
        isViewOnce = true,
        viewOnceCount = viewOnceCount,
        consumedByMe = consumedByMe,
    ),
    currentUserId = "me",
    preferences = FrenchReader,
)

private fun BubbleContent.kind() = BubbleRenderKind.resolve(
    isDeleted = isDeleted,
    ephemeral = EphemeralLifecycle.State.None,
    isViewOnce = isViewOnce,
    isViewOnceOpenedByMe = isViewOnceOpenedByMe,
)

class BubbleViewOnceOpenedTest {

    @Test
    fun `a view-once opened by another group member stays openable for me`() {
        val content = viewOnce(viewOnceCount = 2, consumedByMe = false)

        assertThat(content.isViewOnceOpenedByMe).isFalse()
        assertThat(content.kind()).isEqualTo(BubbleRenderKind.Kind.Standard)
    }

    @Test
    fun `a view-once I opened shows the burned tombstone`() {
        val content = viewOnce(viewOnceCount = 1, consumedByMe = true)

        assertThat(content.kind()).isEqualTo(BubbleRenderKind.Kind.Burned)
    }

    @Test
    fun `an unknown consumption is treated as not opened`() {
        val content = viewOnce(viewOnceCount = 3, consumedByMe = null)

        assertThat(content.kind()).isEqualTo(BubbleRenderKind.Kind.Standard)
    }
}
