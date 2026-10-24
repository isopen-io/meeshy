package me.meeshy.sdk.model.conversationlist

import com.google.common.truth.Truth.assertThat
import com.google.common.truth.Truth.assertWithMessage
import me.meeshy.sdk.model.ApiConversation
import me.meeshy.sdk.model.ApiParticipant
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
    ) = ApiConversation(
        id = "c1",
        identifier = "c1",
        type = type,
        title = "Équipe",
        isActive = isActive,
        currentUserRole = currentUserRole,
        participants = peerUserId?.let { listOf(ApiParticipant(id = "p-peer", userId = it)) }.orEmpty(),
        viewerWriteRestriction = restriction,
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

    // ── Administration ──

    @Test
    fun `the admin console url points at the conversation sheet of the web console`() {
        assertThat(ConversationRowMenuCapabilities.adminConsoleUrl("c1", "https://meeshy.me"))
            .isEqualTo("https://meeshy.me/admin/conversations/c1")
    }
}
