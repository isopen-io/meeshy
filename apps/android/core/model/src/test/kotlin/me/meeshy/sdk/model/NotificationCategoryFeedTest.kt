package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class NotificationCategoryFeedTest {

    private fun row(id: String, type: String, read: Boolean = false, at: String = "2026-10-27T10:00:00Z") =
        ApiNotification(id = id, type = type, state = NotificationState(isRead = read, createdAt = at))

    @Test
    fun `toutes ne montre que le cache et masque le contenu consomme`() {
        val cache = listOf(row("a", "new_message", read = true), row("b", "friend_request", read = true), row("c", "new_message"))
        val ids = NotificationCategoryFeed.visible(NotificationFilterCategory.ALL, cache, fetched = listOf(row("z", "new_message")))
            .map { it.id }
        assertThat(ids).containsExactly("b", "c").inOrder()
    }

    @Test
    fun `une categorie ajoute les lignes du serveur absentes du cache, plus recentes d'abord`() {
        val cache = listOf(row("a", "new_message", at = "2026-10-27T10:00:00Z"))
        val fetched = listOf(row("old", "new_message", at = "2026-10-01T10:00:00Z"), row("a", "new_message", at = "2026-10-27T10:00:00Z"))
        val ids = NotificationCategoryFeed.visible(NotificationFilterCategory.MESSAGES, cache, fetched).map { it.id }
        assertThat(ids).containsExactly("a", "old").inOrder()
    }

    @Test
    fun `le cache gagne sur la version servie d'une meme ligne`() {
        val cache = listOf(row("a", "friend_request", read = true))
        val fetched = listOf(row("a", "friend_request", read = false))
        val shown = NotificationCategoryFeed.visible(NotificationFilterCategory.CONTACTS, cache, fetched)
        assertThat(shown.single().state.isRead).isTrue()
    }

    @Test
    fun `une ligne lue d'une famille consommable quitte aussi la liste servie`() {
        val fetched = listOf(row("m", "new_message", read = true))
        assertThat(NotificationCategoryFeed.visible(NotificationFilterCategory.MESSAGES, emptyList(), fetched)).isEmpty()
    }

    @Test
    fun `withoutRemoved retire les lignes parties du cache`() {
        val before = listOf(row("a", "new_message"), row("b", "new_message"))
        val after = listOf(row("a", "new_message"))
        val fetched = listOf(row("a", "new_message"), row("b", "new_message"), row("c", "new_message"))
        assertThat(NotificationCategoryFeed.withoutRemoved(fetched, before, after).map { it.id }).containsExactly("a", "c")
    }
}
