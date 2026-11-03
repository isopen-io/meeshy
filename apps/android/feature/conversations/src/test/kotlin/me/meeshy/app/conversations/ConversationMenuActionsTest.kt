package me.meeshy.app.conversations

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class ConversationMenuActionsTest {

    private val calls = mutableListOf<String>()

    private fun actions(withDestinations: Boolean = true) = ConversationRowActions(
        onTogglePin = { calls += "pin" },
        onToggleMute = { calls += "mute" },
        onMarkRead = { calls += "read" },
        onMarkUnread = { calls += "unread" },
        onSearch = { calls += "search" },
        onRequestRename = { calls += "rename" },
        onRequestLeave = { calls += "leave" },
        onRemove = { calls += "remove" },
        onInvite = { calls += "invite" },
        onBlock = { calls += "block" },
        onUnblock = { calls += "unblock" },
        onReport = { calls += "report" },
        onOpenAdmin = { calls += "admin" },
        onLockToggle = { calls += "lock" },
        onToggleArchive = { calls += "archive" },
        onToggleMentionsOnly = { calls += "mentions" },
        onDiscardDraft = { calls += "draft" },
        onCall = if (withDestinations) ({ calls += "call" }) else null,
        onViewInfo = if (withDestinations) ({ calls += "info" }) else null,
        onViewProfile = if (withDestinations) ({ calls += "profile" }) else null,
    )

    @Test
    fun `Rechercher, Appeler et Détails raisent chacun leur geste`() {
        val actions = actions()
        actions.perform(ConversationMenuEntry.SEARCH)
        actions.perform(ConversationMenuEntry.CALL)
        actions.perform(ConversationMenuEntry.DETAILS)

        assertThat(calls).containsExactly("search", "call", "info").inOrder()
    }

    @Test
    fun `Appeler sans destination ne fait rien`() {
        actions(withDestinations = false).perform(ConversationMenuEntry.CALL)

        assertThat(calls).isEmpty()
    }

    @Test
    fun `chaque bascule passe par le meme geste dans ses deux sens`() {
        val actions = actions()
        listOf(
            ConversationMenuEntry.PIN, ConversationMenuEntry.UNPIN,
            ConversationMenuEntry.LOCK, ConversationMenuEntry.UNLOCK,
            ConversationMenuEntry.ARCHIVE, ConversationMenuEntry.UNARCHIVE,
            ConversationMenuEntry.MENTIONS_ONLY, ConversationMenuEntry.ALL_NOTIFICATIONS,
        ).forEach { actions.perform(it) }

        assertThat(calls).containsExactly(
            "pin", "pin", "lock", "lock", "archive", "archive", "mentions", "mentions",
        ).inOrder()
    }

    @Test
    fun `supprimer et masquer ouvrent la meme confirmation de retrait`() {
        val actions = actions()
        actions.perform(ConversationMenuEntry.DELETE)
        actions.perform(ConversationMenuEntry.HIDE)

        assertThat(calls).containsExactly("remove", "remove")
    }

    @Test
    fun `bloquer, signaler, inviter, quitter, renommer et administrer ouvrent leur dialogue`() {
        val actions = actions()
        listOf(
            ConversationMenuEntry.BLOCK, ConversationMenuEntry.UNBLOCK, ConversationMenuEntry.REPORT,
            ConversationMenuEntry.INVITE, ConversationMenuEntry.LEAVE, ConversationMenuEntry.RENAME,
            ConversationMenuEntry.ADMIN_OPEN,
        ).forEach { actions.perform(it) }

        assertThat(calls).containsExactly("block", "unblock", "report", "invite", "leave", "rename", "admin").inOrder()
    }

    @Test
    fun `gerer les membres appelle la porte que l hote tend`() {
        actions().perform(ConversationMenuEntry.MANAGE_MEMBERS) { calls += "members" }

        assertThat(calls).containsExactly("members")
    }

    @Test
    fun `les sous-menus et les etiquettes n agissent pas ici`() {
        val actions = actions()
        listOf(
            ConversationMenuEntry.FAVORITE, ConversationMenuEntry.MOVE,
            ConversationMenuEntry.READING_MODE, ConversationMenuEntry.TAGS,
        ).forEach { actions.perform(it) }

        assertThat(calls).isEmpty()
    }
}
