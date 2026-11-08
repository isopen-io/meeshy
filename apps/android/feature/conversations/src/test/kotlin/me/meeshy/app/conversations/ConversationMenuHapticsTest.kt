package me.meeshy.app.conversations

import com.google.common.truth.Truth.assertThat
import me.meeshy.app.conversations.ConversationMenuEntry.*
import org.junit.Test

class ConversationMenuHapticsTest {

    @Test
    fun `pin, call, lock, archive and invite answer with a medium tap`() {
        listOf(PIN, UNPIN, CALL, LOCK, UNLOCK, ARCHIVE, UNARCHIVE, INVITE).forEach {
            assertThat(it.haptic).isEqualTo(ConversationMenuHaptic.MEDIUM)
        }
    }

    @Test
    fun `what removes or blocks answers with a heavy tap`() {
        listOf(BLOCK, UNBLOCK, LEAVE, DELETE, HIDE, DELETE_FOR_ALL, MAKE_OBSOLETE).forEach {
            assertThat(it.haptic).isEqualTo(ConversationMenuHaptic.HEAVY)
        }
    }

    @Test
    fun `the other entries answer with a light tap`() {
        listOf(MUTE, MARK_READ, SEARCH, DETAILS, RENAME, FAVORITE, MOVE, REPORT, ADMIN_OPEN, TAGS).forEach {
            assertThat(it.haptic).isEqualTo(ConversationMenuHaptic.LIGHT)
        }
    }

    @Test
    fun `only the removing entries are red, unblock is not`() {
        assertThat(ConversationMenuEntry.entries.filter { it.isDestructive })
            .containsExactly(BLOCK, LEAVE, DELETE, HIDE, DELETE_FOR_ALL, MAKE_OBSOLETE)
    }

    @Test
    fun `only favorite, move and reading mode open a submenu`() {
        assertThat(ConversationMenuEntry.entries.filter { it.opensSubmenu })
            .containsExactly(FAVORITE, MOVE, READING_MODE)
    }
}
