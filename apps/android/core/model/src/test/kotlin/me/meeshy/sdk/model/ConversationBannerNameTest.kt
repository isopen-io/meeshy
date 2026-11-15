package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/**
 * The local-first banner group name — the renamed thread with its favorite emoji in the lead.
 *
 * Port of iOS `NotificationToastManager.ConversationPresentation.composedSubtitle`
 * (`NotificationBannerGroupNameTests.swift`): the favorite goes FIRST, a blank favorite drops out,
 * and the local rename wins over the server title. The Android addition to the iOS pure surface is
 * the `null` return that lets the framing fall back to the server title when the device knows no
 * local name — proven here so the fallback is a guarantee, not an accident.
 */
class ConversationBannerNameTest {

    @Test
    fun `the favorite emoji leads the name`() {
        assertThat(ConversationBannerName.composed(customName = "Maman", title = null, favoriteEmoji = "⭐️"))
            .isEqualTo("⭐️ Maman")
    }

    @Test
    fun `no favorite yields the name alone`() {
        assertThat(ConversationBannerName.composed(customName = "Maman", title = null, favoriteEmoji = null))
            .isEqualTo("Maman")
    }

    @Test
    fun `a blank favorite is treated as absent`() {
        assertThat(ConversationBannerName.composed(customName = "Maman", title = null, favoriteEmoji = "   "))
            .isEqualTo("Maman")
    }

    @Test
    fun `a surrounding-whitespace favorite is trimmed before it leads`() {
        assertThat(ConversationBannerName.composed(customName = "Maman", title = null, favoriteEmoji = " 🔥 "))
            .isEqualTo("🔥 Maman")
    }

    @Test
    fun `the local rename wins over the server title`() {
        assertThat(
            ConversationBannerName.composed(
                customName = "Mon équipe à moi",
                title = "Équipe Tech",
                favoriteEmoji = "😴",
            ),
        ).isEqualTo("😴 Mon équipe à moi")
    }

    @Test
    fun `a blank rename falls back to the server title, still favorite-first`() {
        assertThat(
            ConversationBannerName.composed(customName = "   ", title = "Équipe Tech", favoriteEmoji = "🎯"),
        ).isEqualTo("🎯 Équipe Tech")
    }

    @Test
    fun `the server title is used when there is no rename`() {
        assertThat(
            ConversationBannerName.composed(customName = null, title = "Équipe Tech", favoriteEmoji = null),
        ).isEqualTo("Équipe Tech")
    }

    @Test
    fun `a blank name in every field yields null so the caller keeps the server title`() {
        assertThat(ConversationBannerName.composed(customName = "  ", title = "   ", favoriteEmoji = "⭐️"))
            .isNull()
    }

    @Test
    fun `both name fields absent yield null`() {
        assertThat(ConversationBannerName.composed(customName = null, title = null, favoriteEmoji = "⭐️"))
            .isNull()
    }

    @Test
    fun `a surrounding-whitespace name is trimmed`() {
        assertThat(ConversationBannerName.composed(customName = "  Maman  ", title = null, favoriteEmoji = null))
            .isEqualTo("Maman")
    }
}
