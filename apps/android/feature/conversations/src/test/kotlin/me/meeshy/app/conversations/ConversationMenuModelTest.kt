package me.meeshy.app.conversations

import com.google.common.truth.Truth.assertThat
import me.meeshy.app.conversations.ConversationMenuEntry.*
import me.meeshy.sdk.model.ApiConversation
import me.meeshy.sdk.model.ApiParticipant
import me.meeshy.sdk.model.MeeshyUser
import me.meeshy.sdk.model.conversationlist.ConversationRowMenuCapabilities
import org.junit.Test

class ConversationMenuModelTest {

    private val allDestinations = ConversationMenuDestinations(
        details = true, profile = true, call = true, manageMembers = true, admin = true,
    )

    private fun user(role: String = "USER", isAnonymous: Boolean = false) =
        MeeshyUser(id = "me", username = "me", displayName = "Me", role = role, isAnonymous = isAnonymous)

    private fun conversation(
        type: String = "group",
        role: String? = "member",
        peer: String? = null,
        isActive: Boolean = true,
        announcement: Boolean = false,
    ) = ApiConversation(
        id = "c1",
        identifier = "c1",
        type = type,
        title = "Équipe",
        isActive = isActive,
        currentUserRole = role,
        isAnnouncementChannel = announcement,
        participants = peer?.let { listOf(ApiParticipant(id = "p", userId = it)) }.orEmpty(),
    )

    private fun menu(
        conversation: ApiConversation = conversation(),
        user: MeeshyUser? = user(),
        isPeerBlocked: Boolean? = null,
        isCreator: Boolean = false,
        isPinned: Boolean = false,
        isMuted: Boolean = false,
        mentionsOnly: Boolean = false,
        hasUnread: Boolean = false,
        hasDraft: Boolean = false,
        isLocked: Boolean = false,
        isArchived: Boolean = false,
        destinations: ConversationMenuDestinations = allDestinations,
    ) = ConversationMenuModel.make(
        ConversationMenuInput(
            capabilities = ConversationRowMenuCapabilities.make(conversation, user),
            isPinned = isPinned,
            isMuted = isMuted,
            mentionsOnly = mentionsOnly,
            hasUnread = hasUnread,
            hasDraft = hasDraft,
            isLocked = isLocked,
            isArchived = isArchived,
            isPeerBlocked = isPeerBlocked,
            isCreator = isCreator,
            destinations = destinations,
        ),
    )

    @Test
    fun `a direct offers search, call, block, report and hides under the word delete`() {
        val entries = menu(conversation(type = "direct", peer = "peer"), isPeerBlocked = false).entries

        assertThat(entries).containsAtLeast(SEARCH, CALL, DETAILS, BLOCK, REPORT, DELETE)
        assertThat(entries).containsNoneOf(HIDE, LEAVE, RENAME, INVITE, MANAGE_MEMBERS)
    }

    @Test
    fun `a group member hides the chat, leaves it and cannot call from the menu`() {
        val entries = menu(conversation(type = "group")).entries

        assertThat(entries).containsAtLeast(HIDE, LEAVE, REPORT)
        assertThat(entries).containsNoneOf(DELETE, CALL, BLOCK, UNBLOCK, RENAME, INVITE)
    }

    @Test
    fun `a group moderator renames, manages members and invites`() {
        val entries = menu(conversation(role = "moderator")).entries

        assertThat(entries).containsAtLeast(RENAME, MANAGE_MEMBERS, INVITE)
    }

    @Test
    fun `a public member invites but does not rename`() {
        val entries = menu(conversation(type = "public")).entries

        assertThat(entries).contains(INVITE)
        assertThat(entries).doesNotContain(RENAME)
    }

    @Test
    fun `Global is never left, renamed or deleted for everyone and only a platform admin opens the admin console`() {
        val member = menu(conversation(type = "global", role = "creator"), isCreator = true).entries
        val admin = menu(conversation(type = "global"), user = user(role = "ADMIN")).entries

        assertThat(member).containsNoneOf(LEAVE, RENAME, DELETE_FOR_ALL, ADMIN_OPEN)
        assertThat(admin).contains(ADMIN_OPEN)
    }

    @Test
    fun `an announcement channel keeps the same laws, a member only reads and hides it`() {
        val entries = menu(conversation(type = "broadcast", announcement = true)).entries

        assertThat(entries).containsAtLeast(HIDE, LEAVE)
        assertThat(entries).containsNoneOf(RENAME, INVITE, MANAGE_MEMBERS)
    }

    @Test
    fun `a closed group offers neither rename, invite nor leave`() {
        val entries = menu(conversation(role = "creator", isActive = false)).entries

        assertThat(entries).containsNoneOf(RENAME, INVITE, LEAVE, MANAGE_MEMBERS)
    }

    @Test
    fun `a conversation with oneself offers no report and no call`() {
        val entries = menu(conversation(type = "direct", peer = "me"), isPeerBlocked = null).entries

        assertThat(entries).containsNoneOf(REPORT, CALL, BLOCK, UNBLOCK)
    }

    @Test
    fun `a blocked peer offers unblock instead of block`() {
        val entries = menu(conversation(type = "direct", peer = "peer"), isPeerBlocked = true).entries

        assertThat(entries).contains(UNBLOCK)
        assertThat(entries).doesNotContain(BLOCK)
    }

    @Test
    fun `a locked row offers unlock and no member management, the sealed content stays sealed`() {
        val entries = menu(conversation(role = "creator"), isLocked = true).entries

        assertThat(entries).contains(UNLOCK)
        assertThat(entries).containsNoneOf(LOCK, MANAGE_MEMBERS)
    }

    @Test
    fun `a destination the host cannot open removes its entry`() {
        val entries = menu(
            conversation(type = "direct", peer = "peer"),
            isPeerBlocked = false,
            destinations = ConversationMenuDestinations(),
        ).entries

        assertThat(entries).containsNoneOf(DETAILS, CALL, VIEW_PROFILE, ADMIN_OPEN)
    }

    @Test
    fun `the header toggles follow the row state`() {
        val on = menu(isPinned = true, isMuted = true, hasUnread = true).header
        val off = menu().header

        assertThat(on).containsExactly(UNPIN, UNMUTE, MARK_READ).inOrder()
        assertThat(off).containsExactly(PIN, MUTE, MARK_UNREAD).inOrder()
    }

    @Test
    fun `mentions only is meaningless while muted, and flips back to all notifications`() {
        assertThat(menu(isMuted = true).entries).containsNoneOf(MENTIONS_ONLY, ALL_NOTIFICATIONS)
        assertThat(menu(mentionsOnly = true).entries).contains(ALL_NOTIFICATIONS)
        assertThat(menu().entries).contains(MENTIONS_ONLY)
    }

    @Test
    fun `delete for everyone is for the creator whom the law lets`() {
        assertThat(menu(conversation(role = "creator"), isCreator = true).entries).contains(DELETE_FOR_ALL)
        assertThat(menu(conversation(role = "admin"), isCreator = false).entries).doesNotContain(DELETE_FOR_ALL)
        assertThat(menu(conversation(role = "member"), isCreator = true).entries).doesNotContain(DELETE_FOR_ALL)
    }

    @Test
    fun `an encrypted or announcement row still answers to the same capabilities, nothing local`() {
        val encrypted = conversation(type = "group").copy(encryptionMode = "e2ee")
        assertThat(menu(encrypted).entries).containsAtLeast(PIN, SEARCH, HIDE)
    }

    @Test
    fun `sections come in reading order and destructive entries close the menu`() {
        val model = menu(conversation(role = "creator"), isCreator = true)

        assertThat(model.groups.map { it.section }).containsExactly(
            ConversationMenuSection.HEADER,
            ConversationMenuSection.REACH,
            ConversationMenuSection.ORGANIZE,
            ConversationMenuSection.MORE,
            ConversationMenuSection.DEPARTURE,
        ).inOrder()
        assertThat(model.departure).containsAtLeast(LEAVE, HIDE, DELETE_FOR_ALL)
        assertThat(model.departure.all { it.isDestructive }).isTrue()
    }

    @Test
    fun `the archive entry vanishes when the gateway imposes the archive`() {
        val conversation = conversation(type = "global")
        val model = ConversationMenuModel.make(
            ConversationMenuInput(
                capabilities = ConversationRowMenuCapabilities.make(conversation, user()).copy(canToggleArchive = false),
                isPinned = false, isMuted = false, mentionsOnly = false, hasUnread = false, hasDraft = false,
                isLocked = false, isArchived = true, isPeerBlocked = null, isCreator = false,
            ),
        )

        assertThat(model.entries).containsNoneOf(ARCHIVE, UNARCHIVE)
    }

    @Test
    fun `the reading mode slot is empty until its lot fills it`() {
        assertThat(menu().entries).doesNotContain(READING_MODE)
    }
}
