package me.meeshy.sdk.model.conversationlist

import com.google.common.truth.Truth.assertThat
import com.google.common.truth.Truth.assertWithMessage
import me.meeshy.sdk.model.ApiConversation
import me.meeshy.sdk.model.ApiParticipant
import me.meeshy.sdk.model.ConversationViewerCapabilities
import me.meeshy.sdk.model.ConversationWriteRestriction
import me.meeshy.sdk.model.MeeshyUser
import me.meeshy.sdk.model.conversationlist.ConversationRowMenuCapabilities.Removal
import org.junit.Test

/**
 * Port de `ConversationRowMenuCapabilitiesTests.swift` (#11215) : le menu d'une rangée ne propose
 * que ce que la loi partagée accorde au lecteur.
 */
class ConversationRowMenuCapabilitiesTest {

    private fun user(id: String = "me", role: String? = "USER", isAnonymous: Boolean? = false) =
        MeeshyUser(id = id, username = "me", displayName = "Me", role = role, isAnonymous = isAnonymous)

    private fun conversation(
        type: String = "group",
        currentUserRole: String? = "member",
        peerUserId: String? = null,
        isActive: Boolean = true,
        restriction: ConversationWriteRestriction? = null,
        capabilities: ConversationViewerCapabilities? = null,
    ) = ApiConversation(
        id = "c1",
        identifier = "c1",
        type = type,
        title = "Équipe",
        isActive = isActive,
        currentUserRole = currentUserRole,
        participants = peerUserId?.let { listOf(ApiParticipant(id = "p-peer", userId = it)) }.orEmpty(),
        viewerWriteRestriction = restriction,
        viewerCapabilities = capabilities,
    )

    private fun caps(conversation: ApiConversation, user: MeeshyUser?) =
        ConversationRowMenuCapabilities.make(conversation, user)

    // ── Renommer ──

    @Test
    fun `a group member does not rename, the gateway requires MODERATOR or above`() {
        assertThat(caps(conversation(currentUserRole = "member"), user()).rename).isFalse()
        assertThat(caps(conversation(currentUserRole = "moderator"), user()).rename).isTrue()
    }

    @Test
    fun `Global never renames, even for a platform admin, and a direct never renames`() {
        assertThat(caps(conversation(type = "global", currentUserRole = "creator"), user(role = "ADMIN")).rename).isFalse()
        assertThat(caps(conversation(type = "direct", currentUserRole = "creator", peerUserId = "peer"), user()).rename).isFalse()
    }

    // ── Inviter et lien de partage ──

    @Test
    fun `a group creator invites and a group member does not`() {
        assertThat(caps(conversation(currentUserRole = "creator"), user()).invite).isTrue()
        assertThat(caps(conversation(currentUserRole = "member"), user()).invite).isFalse()
    }

    @Test
    fun `a public member invites like the gateway but a broadcast member and a public guest do not`() {
        assertThat(caps(conversation(type = "public"), user()).invite).isTrue()
        assertThat(caps(conversation(type = "broadcast"), user()).invite).isFalse()
        assertThat(caps(conversation(type = "public"), user(isAnonymous = true)).invite).isFalse()
    }

    @Test
    fun `only privileged platform roles invite into Global`() {
        assertThat(caps(conversation(type = "global", currentUserRole = "creator"), user()).invite).isFalse()
        assertThat(caps(conversation(type = "global"), user(role = "MODERATOR")).invite).isTrue()
        assertThat(caps(conversation(type = "global"), user(role = "ADMIN")).invite).isTrue()
        assertThat(caps(conversation(type = "global"), user(role = "BIGBOSS")).invite).isTrue()
    }

    @Test
    fun `a legacy uppercase row keeps the rights the gateway grants`() {
        val caps = caps(conversation(currentUserRole = "ADMIN"), user())
        assertThat(caps.rename).isTrue()
        assertThat(caps.invite).isTrue()
    }

    // ── Rôle de plateforme ──

    @Test
    fun `a platform admin member renames and opens the admin console`() {
        val caps = caps(conversation(currentUserRole = "member"), user(role = "ADMIN"))
        assertThat(caps.rename).isTrue()
        assertThat(caps.adminOpen).isTrue()
        assertThat(caps(conversation(), user(role = "BIGBOSS")).adminOpen).isTrue()
    }

    @Test
    fun `adminOpen is reserved to ADMIN and BIGBOSS`() {
        assertThat(caps(conversation(), user(role = "MODERATOR")).adminOpen).isFalse()
        assertThat(caps(conversation(), user(role = "USER")).adminOpen).isFalse()
    }

    @Test
    fun `AUDIT has nothing more than USER`() {
        listOf("direct", "group", "public", "global", "broadcast").forEach { type ->
            listOf("member", "moderator", "admin", "creator").forEach { role ->
                val row = conversation(type = type, currentUserRole = role, peerUserId = if (type == "direct") "peer" else null)
                assertWithMessage("$type, $role")
                    .that(caps(row, user(role = "AUDIT")))
                    .isEqualTo(caps(row, user(role = "USER")))
            }
        }
    }

    // ── Quitter ──

    @Test
    fun `leave is absent in a direct and in Global and present for a group member`() {
        assertThat(caps(conversation(type = "direct", peerUserId = "peer"), user()).leave).isFalse()
        assertThat(caps(conversation(type = "global"), user()).leave).isFalse()
        assertThat(caps(conversation(), user()).leave).isTrue()
    }

    @Test
    fun `a closed conversation offers neither leave nor rename`() {
        val caps = caps(conversation(currentUserRole = "creator", isActive = false), user())
        assertThat(caps.leave).isFalse()
        assertThat(caps.rename).isFalse()
    }

    // ── Signaler ──

    @Test
    fun `report is present for another peer and for a group but false on a conversation with oneself`() {
        assertThat(caps(conversation(type = "direct", peerUserId = "peer"), user()).report).isTrue()
        assertThat(caps(conversation(), user()).report).isTrue()
        assertThat(caps(conversation(type = "direct", peerUserId = "me"), user(id = "me")).report).isFalse()
    }

    @Test
    fun `an anonymous guest has neither report nor removal nor leave`() {
        val caps = caps(conversation(), user(isAnonymous = true))
        assertThat(caps.report).isFalse()
        assertThat(caps.removal).isNull()
        assertThat(caps.leave).isFalse()
    }

    @Test
    fun `an unloaded viewer opens nothing role bound`() {
        val caps = caps(conversation(currentUserRole = "creator"), null)
        assertThat(caps.rename).isFalse()
        assertThat(caps.invite).isFalse()
        assertThat(caps.adminOpen).isFalse()
    }

    // ── Supprimer / Masquer ──

    @Test
    fun `removal is delete in a direct and hide everywhere else, admins included`() {
        assertThat(caps(conversation(type = "direct", peerUserId = "peer"), user()).removal).isEqualTo(Removal.DELETE)
        assertThat(caps(conversation(type = "dm", peerUserId = "peer"), user()).removal).isEqualTo(Removal.DELETE)
        assertThat(caps(conversation(currentUserRole = "member"), user()).removal).isEqualTo(Removal.HIDE)
        assertThat(caps(conversation(currentUserRole = "admin"), user()).removal).isEqualTo(Removal.HIDE)
        assertThat(caps(conversation(), user(role = "BIGBOSS")).removal).isEqualTo(Removal.HIDE)
    }

    // ── Archive imposée ──

    @Test
    fun `an archive imposed on a minor in Global hides the archive toggle`() {
        val minor = conversation(type = "global", restriction = ConversationWriteRestriction.MinorGlobal)
        assertThat(caps(minor, user()).canToggleArchive).isFalse()
        assertThat(caps(conversation(type = "global"), user()).canToggleArchive).isTrue()
        assertThat(caps(conversation(), user()).canToggleArchive).isTrue()
    }

    // ── Gérer les membres (#12865) ──

    /** La grille type × rôle d'iOS (`ConversationRowMenuCapabilitiesTests`, #12631). */
    @Test
    fun `managing members follows the type by role grid of iOS`() {
        val grid = listOf(
            Triple("group", "member", "USER") to false,
            Triple("group", "moderator", "USER") to true,
            Triple("group", "admin", "USER") to true,
            Triple("group", "creator", "USER") to true,
            Triple("group", "MODERATOR", "USER") to true,
            Triple("public", "member", "USER") to false,
            Triple("public", "moderator", "USER") to true,
            Triple("broadcast", "member", "USER") to false,
            Triple("broadcast", "admin", "USER") to true,
            Triple("global", "member", "USER") to false,
            Triple("global", "member", "MODERATOR") to true,
            Triple("group", "member", "MODERATOR") to true,
            Triple("group", "member", "ADMIN") to true,
            Triple("group", "member", "AUDIT") to false,
            Triple("group", "member", "ANALYST") to false,
        )
        grid.forEach { (row, expected) ->
            val (type, member, platform) = row
            assertWithMessage("$type · $member · $platform")
                .that(caps(conversation(type = type, currentUserRole = member), user(role = platform)).manageMembers)
                .isEqualTo(expected)
        }
    }

    @Test
    fun `a direct never manages members whatever the role`() {
        listOf("USER", "MODERATOR", "ADMIN", "BIGBOSS").forEach { platform ->
            listOf("member", "moderator", "admin", "creator").forEach { member ->
                assertWithMessage("$member · $platform")
                    .that(caps(conversation(type = "direct", currentUserRole = member, peerUserId = "peer"), user(role = platform)).manageMembers)
                    .isFalse()
            }
        }
    }

    @Test
    fun `a closed group manages no member`() {
        assertThat(caps(conversation(currentUserRole = "creator", isActive = false), user()).manageMembers).isFalse()
    }

    @Test
    fun `a reader not yet loaded manages no member`() {
        assertThat(caps(conversation(currentUserRole = "creator"), null).manageMembers).isFalse()
    }

    @Test
    fun `the row of a locked conversation offers no member management, its content is sealed`() {
        val moderator = caps(conversation(currentUserRole = "moderator"), user())
        assertThat(moderator.offersManageMembers(isLocked = false)).isTrue()
        assertThat(moderator.offersManageMembers(isLocked = true)).isFalse()
        assertThat(caps(conversation(currentUserRole = "member"), user()).offersManageMembers(isLocked = false)).isFalse()
    }

    // ── Administration ──

    @Test
    fun `the admin console url points at the conversation sheet of the web console`() {
        assertThat(ConversationRowMenuCapabilities.adminConsoleUrl("c1", "https://meeshy.me"))
            .isEqualTo("https://meeshy.me/admin/conversations/c1")
    }

    // ── Rendre obsolète (#14645) ──

    @Test
    fun `an admin of a group, a public conversation or a channel may make it obsolete, a moderator may not`() {
        listOf("group", "public", "broadcast").forEach { type ->
            assertWithMessage(type).that(caps(conversation(type = type, currentUserRole = "admin"), user()).obsolete).isTrue()
            assertWithMessage(type).that(caps(conversation(type = type, currentUserRole = "creator"), user()).obsolete).isTrue()
            assertWithMessage(type).that(caps(conversation(type = type, currentUserRole = "moderator"), user()).obsolete).isFalse()
        }
    }

    @Test
    fun `Global and an ended conversation are never made obsolete`() {
        assertThat(caps(conversation(type = "global", currentUserRole = "creator"), user(role = "ADMIN")).obsolete).isFalse()
        assertThat(caps(conversation(currentUserRole = "creator", isActive = false), user()).obsolete).isFalse()
        assertThat(caps(conversation(type = "direct", currentUserRole = "member", peerUserId = "peer", isActive = false), user()).obsolete).isFalse()
    }

    // ── #14653 : dans un tête-à-tête, l'un OU l'autre des deux membres le rend obsolète ──

    @Test
    fun `either member of an open direct may make it obsolete, creator or not`() {
        assertThat(caps(conversation(type = "direct", currentUserRole = "member", peerUserId = "peer"), user()).obsolete).isTrue()
        assertThat(caps(conversation(type = "direct", currentUserRole = "creator", peerUserId = "peer"), user()).obsolete).isTrue()
    }

    @Test
    fun `an anonymous or unloaded reader never makes a direct obsolete, and a group member still may not`() {
        assertThat(caps(conversation(type = "direct", currentUserRole = "member", peerUserId = "peer"), user(isAnonymous = true)).obsolete).isFalse()
        assertThat(caps(conversation(type = "direct", currentUserRole = "member", peerUserId = "peer"), null).obsolete).isFalse()
        assertThat(caps(conversation(type = "group", currentUserRole = "member"), user()).obsolete).isFalse()
    }

    // ── Appeler (#14897) ──

    @Test
    fun `a direct with a known peer offers the call, audio and video`() {
        val caps = caps(conversation(type = "direct", currentUserRole = "member", peerUserId = "peer"), user())
        assertThat(caps.call).isTrue()
        assertThat(caps.videoCall).isTrue()
    }

    @Test
    fun `a group never offers the call from the menu, it would ring no single peer`() {
        val caps = caps(conversation(type = "group", currentUserRole = "creator"), user())
        assertThat(caps.call).isFalse()
        assertThat(caps.videoCall).isFalse()
    }

    @Test
    fun `a direct with oneself or without peer offers no call`() {
        assertThat(caps(conversation(type = "direct", peerUserId = "me"), user()).call).isFalse()
        assertThat(caps(conversation(type = "direct"), user()).call).isFalse()
    }

    @Test
    fun `an ended direct and an unloaded reader offer no call`() {
        assertThat(caps(conversation(type = "direct", peerUserId = "peer", isActive = false), user()).call).isFalse()
        assertThat(caps(conversation(type = "direct", peerUserId = "peer"), null).call).isFalse()
    }

    @Test
    fun `only an admin or more of an open group deletes for everyone`() {
        assertThat(caps(conversation(currentUserRole = "admin"), user()).deleteForAll).isTrue()
        assertThat(caps(conversation(currentUserRole = "moderator"), user()).deleteForAll).isFalse()
        assertThat(caps(conversation(type = "direct", currentUserRole = "creator", peerUserId = "peer"), user()).deleteForAll).isFalse()
    }

    // ── Lecteur d'une conversation ouverte (#15269) ──

    @Test
    fun `an open thread falls back on the viewer participation when the row serves no role`() {
        val served = conversation(currentUserRole = null).copy(
            participants = listOf(ApiParticipant(id = "p-me", userId = "me", role = "admin")),
        )

        val viewer = ConversationRowMenuCapabilities.forViewer(served, user())

        assertThat(viewer.rename).isTrue()
        assertThat(viewer.invite).isTrue()
        assertThat(viewer.deleteForAll).isTrue()
    }

    @Test
    fun `an open thread with no role anywhere offers no authority action`() {
        val viewer = ConversationRowMenuCapabilities.forViewer(conversation(currentUserRole = null), user())

        assertThat(viewer.rename).isFalse()
        assertThat(viewer.invite).isFalse()
        assertThat(viewer.manageMembers).isFalse()
    }

    @Test
    fun `in Global only platform admins invite and nobody renames, leaves or deletes for all`() {
        val global = conversation(type = "global", currentUserRole = "member")

        val admin = ConversationRowMenuCapabilities.forViewer(global, user(role = "ADMIN"))
        val ordinary = ConversationRowMenuCapabilities.forViewer(global, user(role = "USER"))

        assertThat(admin.invite).isTrue()
        assertThat(ordinary.invite).isFalse()
        listOf(admin, ordinary).forEach {
            assertThat(it.rename).isFalse()
            assertThat(it.leave).isFalse()
            assertThat(it.deleteForAll).isFalse()
        }
    }

    @Test
    fun `a direct offers no authority action to either member`() {
        val direct = conversation(type = "direct", currentUserRole = "creator", peerUserId = "peer")

        val viewer = ConversationRowMenuCapabilities.forViewer(direct, user())

        assertThat(viewer.rename).isFalse()
        assertThat(viewer.invite).isFalse()
        assertThat(viewer.leave).isFalse()
        assertThat(viewer.manageMembers).isFalse()
    }

    // ── La capacité servie (#14690) ──

    @Test
    fun `a served false hides make obsolete from the sender of a pending request, a member of an open direct`() {
        val served = ConversationViewerCapabilities(canMakeObsolete = false)
        assertThat(caps(conversation(type = "direct", currentUserRole = "member", peerUserId = "peer", capabilities = served), user()).obsolete).isFalse()
        assertThat(caps(conversation(currentUserRole = "admin", capabilities = served), user()).obsolete).isFalse()
    }

    @Test
    fun `a served true opens make obsolete where the local rule refused it`() {
        val served = ConversationViewerCapabilities(canMakeObsolete = true)
        assertThat(caps(conversation(currentUserRole = "member", capabilities = served), user()).obsolete).isTrue()
    }

    @Test
    fun `an absent capability keeps the local rule, never an implicit false`() {
        assertThat(caps(conversation(type = "direct", currentUserRole = "member", peerUserId = "peer"), user()).obsolete).isTrue()
        assertThat(caps(conversation(currentUserRole = "member"), user()).obsolete).isFalse()
    }
}
