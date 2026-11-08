package me.meeshy.app.conversations

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.search.ListMessageHit
import org.junit.Test

class ConversationListMessageSectionContentTest {

    private val searching = ConversationListUiState(searchText = "bonjour", showSkeleton = false)

    @Test
    fun a_search_matching_only_messages_is_populated_by_its_messages_section_not_no_results() {
        assertThat(ConversationListContent.of(searching, messageSectionShown = true))
            .isEqualTo(ConversationListContent.Populated)
    }

    @Test
    fun a_search_matching_nothing_at_all_still_says_no_results() {
        assertThat(ConversationListContent.of(searching, messageSectionShown = false))
            .isEqualTo(ConversationListContent.SearchNoResults)
    }

    @Test
    fun a_message_section_never_populates_a_list_without_any_search() {
        val idle = ConversationListUiState(showSkeleton = false)

        assertThat(ConversationListContent.of(idle, messageSectionShown = true)).isEqualTo(ConversationListContent.ColdEmpty)
    }

    @Test
    fun a_found_message_renders_through_the_global_search_row_with_its_served_text_and_sender() {
        val hit = ListMessageHit(
            messageId = "m1",
            conversationId = "c1",
            createdAtMillis = 0L,
            text = "Bonjour",
            senderName = "Ada",
        )

        val shown = hit.asSearchHit(conversation = null)

        assertThat(shown.message.id).isEqualTo("m1")
        assertThat(shown.message.conversationId).isEqualTo("c1")
        assertThat(shown.message.content).isEqualTo("Bonjour")
        assertThat(shown.message.sender?.name).isEqualTo("Ada")
        assertThat(shown.conversation).isNull()
    }

    @Test
    fun a_found_message_outside_the_cached_list_keeps_the_title_and_photo_the_server_served() {
        val hit = ListMessageHit(
            messageId = "m9",
            conversationId = "c9",
            createdAtMillis = 0L,
            text = "Bonjour",
            senderName = "Ada",
            conversationTitle = "Ada",
            conversationAvatar = "2026/11/ada.png",
        )

        val shown = hit.asSearchHit(conversation = null)

        assertThat(shown.identity("u-me")).isEqualTo(MessageHitIdentity(title = "Ada", avatarUrl = "2026/11/ada.png"))
    }
}
