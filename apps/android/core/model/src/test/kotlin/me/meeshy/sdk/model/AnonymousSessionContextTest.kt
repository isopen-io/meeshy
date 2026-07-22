package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/**
 * Behavioural spec for the anonymous (shared-link guest) permission-hardening
 * core: the [ParticipantPermissions] guest factories and the
 * [AnonymousJoinResponse.toSessionContext] transform.
 *
 * Parity source:
 *  - iOS `ParticipantPermissions.defaultUser` / `.defaultAnonymous`
 *    (`packages/MeeshySDK/Sources/MeeshySDK/Models/ParticipantModels.swift`).
 *  - iOS `AnonymousJoinResponse.toSessionContext`
 *    (`apps/ios/Meeshy/Features/Main/Models/AnonymousSessionContext.swift`): the
 *    join response is trusted for only the messages/files/images flags, while
 *    **videos, audios, locations and links are force-denied** for every guest,
 *    regardless of what the server advertised.
 *
 * SOTA note over iOS: iOS force-unwraps `participant`/`conversation` in the
 * transform (a malformed response crashes) and never guards a blank session
 * token. Android's response models make those fields nullable, so the port
 * returns `null` when the response cannot form a real session (missing
 * participant/conversation, or a blank token that could never authenticate a
 * later guest request) — a graceful degradation instead of a crash.
 *
 * Every expectation is a hand-written literal, never an echo of the production
 * derivation.
 */
class AnonymousSessionContextTest {

    private companion object {
        fun participant(
            id: String = "p1",
            canSendMessages: Boolean = true,
            canSendFiles: Boolean = true,
            canSendImages: Boolean = true,
        ) = AnonymousParticipant(
            id = id,
            canSendMessages = canSendMessages,
            canSendFiles = canSendFiles,
            canSendImages = canSendImages,
        )

        fun response(
            sessionToken: String = "tok",
            participant: AnonymousParticipant? = participant(),
            conversation: JoinedConversation? = JoinedConversation(id = "c1"),
            linkId: String = "l1",
        ) = AnonymousJoinResponse(
            sessionToken = sessionToken,
            participant = participant,
            conversation = conversation,
            linkId = linkId,
        )
    }

    // --- ParticipantPermissions.anonymous(...) : the hardening SSOT ---

    @Test
    fun anonymous_forcesFourCapabilitiesFalse_evenWhenAllRequestedTrue() {
        val perms = ParticipantPermissions.anonymous(
            canSendMessages = true,
            canSendFiles = true,
            canSendImages = true,
        )
        assertThat(perms.canSendVideos).isFalse()
        assertThat(perms.canSendAudios).isFalse()
        assertThat(perms.canSendLocations).isFalse()
        assertThat(perms.canSendLinks).isFalse()
    }

    @Test
    fun anonymous_passesThroughTheThreeNegotiableFlags() {
        val perms = ParticipantPermissions.anonymous(
            canSendMessages = true,
            canSendFiles = false,
            canSendImages = true,
        )
        assertThat(perms.canSendMessages).isTrue()
        assertThat(perms.canSendFiles).isFalse()
        assertThat(perms.canSendImages).isTrue()
    }

    @Test
    fun anonymous_deniesEverything_whenServerGrantsNothing() {
        val perms = ParticipantPermissions.anonymous(
            canSendMessages = false,
            canSendFiles = false,
            canSendImages = false,
        )
        assertThat(perms).isEqualTo(
            ParticipantPermissions(
                canSendMessages = false,
                canSendFiles = false,
                canSendImages = false,
                canSendVideos = false,
                canSendAudios = false,
                canSendLocations = false,
                canSendLinks = false,
            ),
        )
    }

    // --- defaultAnonymous / defaultUser constants ---

    @Test
    fun defaultAnonymous_grantsOnlyMessagesAndImages() {
        assertThat(ParticipantPermissions.defaultAnonymous).isEqualTo(
            ParticipantPermissions(
                canSendMessages = true,
                canSendFiles = false,
                canSendImages = true,
                canSendVideos = false,
                canSendAudios = false,
                canSendLocations = false,
                canSendLinks = false,
            ),
        )
    }

    @Test
    fun defaultUser_grantsEveryCapability() {
        val u = ParticipantPermissions.defaultUser
        assertThat(u.canSendMessages).isTrue()
        assertThat(u.canSendFiles).isTrue()
        assertThat(u.canSendImages).isTrue()
        assertThat(u.canSendVideos).isTrue()
        assertThat(u.canSendAudios).isTrue()
        assertThat(u.canSendLocations).isTrue()
        assertThat(u.canSendLinks).isTrue()
    }

    // --- toSessionContext : the response → hardened session transform ---

    @Test
    fun toSessionContext_hardensGuestCapabilities_ignoringUnnegotiableGrants() {
        val ctx = response(
            participant = participant(canSendMessages = true, canSendFiles = true, canSendImages = true),
        ).toSessionContext()

        assertThat(ctx).isNotNull()
        assertThat(ctx!!.permissions).isEqualTo(
            ParticipantPermissions.anonymous(
                canSendMessages = true,
                canSendFiles = true,
                canSendImages = true,
            ),
        )
        assertThat(ctx.permissions.canSendVideos).isFalse()
        assertThat(ctx.permissions.canSendLinks).isFalse()
    }

    @Test
    fun toSessionContext_carriesTheServerNegotiableFlags() {
        val ctx = response(
            participant = participant(canSendMessages = true, canSendFiles = false, canSendImages = true),
        ).toSessionContext()

        assertThat(ctx!!.permissions.canSendMessages).isTrue()
        assertThat(ctx.permissions.canSendFiles).isFalse()
        assertThat(ctx.permissions.canSendImages).isTrue()
    }

    @Test
    fun toSessionContext_mapsEveryIdentifierFromTheResponse() {
        val ctx = AnonymousJoinResponse(
            sessionToken = "session-abc",
            participant = participant(id = "participant-xyz"),
            conversation = JoinedConversation(id = "conversation-123"),
            linkId = "link-777",
        ).toSessionContext()

        assertThat(ctx!!.sessionToken).isEqualTo("session-abc")
        assertThat(ctx.participantId).isEqualTo("participant-xyz")
        assertThat(ctx.conversationId).isEqualTo("conversation-123")
        assertThat(ctx.linkId).isEqualTo("link-777")
    }

    @Test
    fun toSessionContext_missingParticipant_returnsNull() {
        assertThat(response(participant = null).toSessionContext()).isNull()
    }

    @Test
    fun toSessionContext_missingConversation_returnsNull() {
        assertThat(response(conversation = null).toSessionContext()).isNull()
    }

    @Test
    fun toSessionContext_blankSessionToken_returnsNull() {
        assertThat(response(sessionToken = "   ").toSessionContext()).isNull()
    }

    @Test
    fun toSessionContext_emptySessionToken_returnsNull() {
        assertThat(response(sessionToken = "").toSessionContext()).isNull()
    }
}
