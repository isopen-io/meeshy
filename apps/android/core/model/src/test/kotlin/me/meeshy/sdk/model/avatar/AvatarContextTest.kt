package me.meeshy.sdk.model.avatar

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class AvatarContextTest {

    private data class Row(
        val context: AvatarContext,
        val size: Float,
        val ringWidth: Float,
        val storyRing: Boolean,
        val mood: Boolean,
        val tappable: Boolean,
        val defaultPulse: Boolean,
        val animatesRing: Boolean,
        val animatesMood: Boolean,
        val shadow: Float,
        val shadowY: Float,
    )

    private val table = listOf(
        Row(AvatarContext.StoryTray, 88f, 0.7f, true, true, true, false, true, true, 8f, 4f),
        Row(AvatarContext.StoryTrayCompact, 36f, 1.5f, true, true, true, false, true, true, 8f, 4f),
        Row(AvatarContext.StoryViewer, 44f, 2.5f, false, false, true, false, true, false, 4f, 4f),
        Row(AvatarContext.StoryViewerRow, 44f, 2.5f, false, true, true, false, false, false, 4f, 4f),
        Row(AvatarContext.FeedComposer, 36f, 2.5f, true, true, true, false, true, true, 4f, 4f),
        Row(AvatarContext.PostAuthor, 44f, 2.5f, true, true, true, false, true, true, 8f, 4f),
        Row(AvatarContext.PostComment, 28f, 1.5f, false, false, true, false, false, false, 2f, 1f),
        Row(AvatarContext.PostReaction, 20f, 1.5f, false, false, false, false, false, false, 0f, 0f),
        Row(AvatarContext.MessageBubble, 32f, 1.5f, true, true, true, true, false, false, 4f, 2f),
        Row(AvatarContext.TypingIndicator, 24f, 1.5f, false, false, false, false, false, false, 0f, 0f),
        Row(AvatarContext.ConversationList, 52f, 2.5f, true, true, true, false, false, false, 0f, 0f),
        Row(AvatarContext.ConversationHeaderCollapsed, 44f, 2.5f, true, true, true, true, false, false, 8f, 4f),
        Row(AvatarContext.ConversationHeaderExpanded, 44f, 2.5f, true, true, true, true, true, false, 8f, 4f),
        Row(AvatarContext.ConversationHeaderStacked, 28f, 1.5f, true, true, true, false, false, false, 4f, 2f),
        Row(AvatarContext.RecentParticipant, 20f, 1.5f, true, true, true, false, false, false, 0f, 0f),
        Row(AvatarContext.ProfileBanner, 90f, 2.5f, true, true, true, true, true, true, 12f, 4f),
        Row(AvatarContext.ProfileEdit, 80f, 2.5f, false, false, true, false, true, false, 8f, 4f),
        Row(AvatarContext.ProfileSheet, 80f, 2.5f, true, true, true, true, true, true, 8f, 4f),
        Row(AvatarContext.UserListItem, 44f, 2.5f, true, false, true, false, false, false, 4f, 4f),
        Row(AvatarContext.Notification, 44f, 2.5f, true, false, true, false, false, false, 4f, 4f),
    )

    @Test
    fun `la table couvre exactement les vingt contextes nommes`() {
        assertThat(table.map { it.context }).containsExactlyElementsIn(AvatarContext.named)
        assertThat(AvatarContext.named).hasSize(20)
    }

    @Test
    fun `chaque contexte porte taille, anneau, drapeaux et ombre de la table iOS`() {
        table.forEach { row ->
            val c = row.context
            assertThat(c.size).isEqualTo(row.size)
            assertThat(c.ringWidth).isEqualTo(row.ringWidth)
            assertThat(c.showsStoryRing).isEqualTo(row.storyRing)
            assertThat(c.showsMoodBadge).isEqualTo(row.mood)
            assertThat(c.isTappable).isEqualTo(row.tappable)
            assertThat(c.defaultPulse).isEqualTo(row.defaultPulse)
            assertThat(c.animatesStoryRing).isEqualTo(row.animatesRing)
            assertThat(c.animatesMoodBadge).isEqualTo(row.animatesMood)
            assertThat(c.shadowRadius).isEqualTo(row.shadow)
            assertThat(c.shadowY).isEqualTo(row.shadowY)
        }
    }

    @Test
    fun `tray 88, liste 52, bulle 32, commentaire 28`() {
        assertThat(AvatarContext.StoryTray.size).isEqualTo(88f)
        assertThat(AvatarContext.ConversationList.size).isEqualTo(52f)
        assertThat(AvatarContext.MessageBubble.size).isEqualTo(32f)
        assertThat(AvatarContext.PostComment.size).isEqualTo(28f)
    }

    @Test
    fun `la pastille d'humeur ne respire ni en liste ni en en-tete de conversation`() {
        listOf(
            AvatarContext.ConversationList, AvatarContext.ConversationHeaderCollapsed,
            AvatarContext.ConversationHeaderExpanded, AvatarContext.ConversationHeaderStacked,
        ).forEach { assertThat(it.animatesMoodBadge).isFalse() }
    }

    @Test
    fun `derives de la taille anneau, initiale, pastille et point`() {
        assertThat(AvatarContext.ConversationList.ringSize).isEqualTo(58f)
        assertThat(AvatarContext.ConversationList.initialFont).isWithin(0.001f).of(19.76f)
        assertThat(AvatarContext.StoryTray.badgeSize).isEqualTo(32f)
        assertThat(AvatarContext.ConversationList.badgeSize).isWithin(0.001f).of(21.84f)
        assertThat(AvatarContext.ConversationList.onlineDotSize).isWithin(0.001f).of(13.52f)
    }

    @Test
    fun `la taille libre suit son parametre et garde les defauts iOS`() {
        val custom = AvatarContext.Custom(30f)
        assertThat(custom.size).isEqualTo(30f)
        assertThat(custom.ringWidth).isEqualTo(1.5f)
        assertThat(custom.defaultPulse).isTrue()
        assertThat(custom.animatesMoodBadge).isFalse()
        assertThat(custom.shadowRadius).isEqualTo(8f)
        assertThat(AvatarContext.Custom(33f).ringWidth).isEqualTo(2.5f)
    }
}
