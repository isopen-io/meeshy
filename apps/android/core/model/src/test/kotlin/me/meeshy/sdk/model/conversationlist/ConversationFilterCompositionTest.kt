package me.meeshy.sdk.model.conversationlist

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.ApiConversation
import me.meeshy.sdk.model.ApiConversationPreferences
import me.meeshy.sdk.model.ConversationFilter
import me.meeshy.sdk.model.ConversationFilter.ALL
import me.meeshy.sdk.model.ConversationFilter.ARCHIVED
import me.meeshy.sdk.model.ConversationFilter.CHANNELS
import me.meeshy.sdk.model.ConversationFilter.FAVORITES
import me.meeshy.sdk.model.ConversationFilter.PERSONAL
import me.meeshy.sdk.model.ConversationFilter.PRIVATE
import me.meeshy.sdk.model.ConversationFilter.UNREAD
import me.meeshy.sdk.model.ConversationFilters
import org.junit.Test

class ConversationFilterCompositionTest {

    private fun toggle(filter: ConversationFilter, vararg selection: ConversationFilter) =
        ConversationFilterComposition.toggling(filter, selection.toSet())

    private fun conversation(
        id: String,
        type: String = "direct",
        unread: Int = 0,
        archived: Boolean = false,
        reaction: String? = null,
        deletedAt: String? = null,
        announcement: Boolean = false,
    ) = ApiConversation(
        id = id,
        type = type,
        unreadCount = unread,
        isAnnouncementChannel = announcement,
        preferences = ApiConversationPreferences(isArchived = archived, reaction = reaction, deletedForUserAt = deletedAt),
    )

    private fun List<ApiConversation>.ids(vararg selection: ConversationFilter) =
        ConversationFilters.apply(this, selection.toSet(), "", null).map { it.id }

    @Test
    fun `un appui ajoute un filtre et un second appui le retire`() {
        assertThat(toggle(UNREAD, ALL)).containsExactly(UNREAD)
        assertThat(toggle(PERSONAL, UNREAD)).containsExactly(UNREAD, PERSONAL)
        assertThat(toggle(PERSONAL, UNREAD, PERSONAL)).containsExactly(UNREAD)
    }

    @Test
    fun `Tous est le neutre et efface les autres`() {
        assertThat(toggle(ALL, UNREAD, PERSONAL)).containsExactly(ALL)
    }

    @Test
    fun `retirer la derniere selection revient a Tous jamais a vide`() {
        assertThat(toggle(UNREAD, UNREAD)).containsExactly(ALL)
        assertThat(ConversationFilterComposition.toggling(UNREAD, emptySet())).containsExactly(UNREAD)
    }

    @Test
    fun `un ensemble vide vaut neutre`() {
        assertThat(ConversationFilterComposition.isNeutral(emptySet())).isTrue()
        assertThat(ConversationFilterComposition.isNeutral(setOf(ALL))).isTrue()
        assertThat(ConversationFilterComposition.isNeutral(setOf(UNREAD))).isFalse()
    }

    @Test
    fun `les familles separent types et etats`() {
        assertThat(ConversationFilterComposition.selectedTypes(setOf(UNREAD, PERSONAL, PRIVATE))).containsExactly(PERSONAL, PRIVATE)
        assertThat(ConversationFilterComposition.selectedStates(setOf(UNREAD, FAVORITES, PERSONAL))).containsExactly(UNREAD, FAVORITES)
        assertThat(ConversationFilterComposition.selectedTypes(setOf(ALL, PERSONAL))).isEmpty()
        assertThat(ConversationFilterComposition.includesArchived(setOf(ARCHIVED, PERSONAL))).isTrue()
    }

    @Test
    fun `Personnel plus Privee combine les types en OU`() {
        val list = listOf(conversation("d"), conversation("g", type = "group"), conversation("p", type = "public"))
        assertThat(list.ids(PERSONAL, PRIVATE)).containsExactly("d", "g")
    }

    @Test
    fun `Non lus plus Personnel montre les non lus parmi les directs`() {
        val list = listOf(
            conversation("du", unread = 2),
            conversation("dr"),
            conversation("gu", type = "group", unread = 1),
        )
        assertThat(list.ids(UNREAD, PERSONAL)).containsExactly("du")
    }

    @Test
    fun `Non lus plus Favoris restreint en ET`() {
        val list = listOf(
            conversation("both", unread = 1, reaction = "x"),
            conversation("unreadOnly", unread = 1),
            conversation("favOnly", reaction = "x"),
        )
        assertThat(list.ids(UNREAD, FAVORITES)).containsExactly("both")
    }

    @Test
    fun `les archives changent de corpus et n'entrent que si le filtre est actif`() {
        val list = listOf(conversation("a", archived = true, unread = 3), conversation("n", unread = 1))
        assertThat(list.ids(UNREAD)).containsExactly("n")
        assertThat(list.ids(ARCHIVED)).containsExactly("a")
        assertThat(list.ids(ALL)).containsExactly("n")
        assertThat(list.ids(ARCHIVED, UNREAD)).containsExactly("a")
    }

    @Test
    fun `les supprimees pour soi ne reapparaissent dans aucun filtre`() {
        val list = listOf(conversation("x", deletedAt = "2026-01-01T00:00:00Z", archived = true))
        assertThat(list.ids(ARCHIVED)).isEmpty()
        assertThat(list.ids(ALL)).isEmpty()
    }

    @Test
    fun `Channels se combine avec un type en OU`() {
        val list = listOf(conversation("c", type = "public", announcement = true), conversation("d"), conversation("g", type = "group"))
        assertThat(list.ids(CHANNELS, PERSONAL)).containsExactly("c", "d")
    }

    @Test
    fun `un ensemble vide ne filtre rien`() {
        val list = listOf(conversation("d"))
        assertThat(ConversationFilters.apply(list, emptySet(), "", null).map { it.id }).containsExactly("d")
    }
}
