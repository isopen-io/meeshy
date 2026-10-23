package me.meeshy.app.conversations

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.ApiConversation
import me.meeshy.sdk.model.ApiConversationPreferences
import me.meeshy.sdk.model.PresenceState
import me.meeshy.ui.component.StoryRingState
import org.junit.Test

/** Le portillon de recomposition: deux instantanés identiques sont égaux, un seul champ vu les sépare. */
class ConversationRowModelTest {

    private fun model(
        conversation: ApiConversation = ApiConversation(id = "c1", title = "Team", type = "group"),
        isLocked: Boolean = false,
        isSelected: Boolean = false,
        isDragging: Boolean = false,
        nowMillis: Long = 1_000L,
    ) = ConversationRowModel(
        conversation = conversation,
        currentUserId = "me",
        currentUserPrefs = null,
        presence = PresenceState.ONLINE,
        storyRing = StoryRingState.None,
        moodEmoji = null,
        draft = null,
        typingDisplayName = null,
        categories = emptyList(),
        previewMessages = null,
        isLocked = isLocked,
        nowMillis = nowMillis,
        isSelected = isSelected,
        isDragging = isDragging,
    )

    @Test
    fun `two snapshots built from the same primitives are structurally equal`() {
        assertThat(model()).isEqualTo(model())
        assertThat(model().hashCode()).isEqualTo(model().hashCode())
    }

    @Test
    fun `pin, mute, unread, lock, selection and drag each change the snapshot`() {
        val base = model()
        val pinned = model(ApiConversation(id = "c1", title = "Team", type = "group", userPreferences = listOf(ApiConversationPreferences(isPinned = true))))
        val muted = model(ApiConversation(id = "c1", title = "Team", type = "group", userPreferences = listOf(ApiConversationPreferences(isMuted = true))))
        val unread = model(ApiConversation(id = "c1", title = "Team", type = "group", unreadCount = 2))
        listOf(pinned, muted, unread, model(isLocked = true), model(isSelected = true), model(isDragging = true), model(nowMillis = 61_000L))
            .forEach { assertThat(it).isNotEqualTo(base) }
    }

    @Test
    fun `the snapshot carries no callback so an unchanged row is skipped`() {
        val fields = ConversationRowModel::class.java.declaredFields.map { it.type.name }
        assertThat(fields.filter { it.startsWith("kotlin.jvm.functions") }).isEmpty()
    }
}
