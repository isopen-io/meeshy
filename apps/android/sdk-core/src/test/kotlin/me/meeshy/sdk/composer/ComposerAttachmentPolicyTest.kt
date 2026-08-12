package me.meeshy.sdk.composer

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.ParticipantPermissions
import org.junit.Test

/**
 * Behavioural spec for the pure composer-affordance policy (feature-parity §Chat
 * "composer gated by participant permissions" — a SOTA improvement over iOS, whose
 * composer never consults [ParticipantPermissions]). The policy maps a
 * participant's hardened capability set onto the concrete affordances the composer
 * may offer: what the "+" ladder shows, whether voice/text are allowed, and
 * whether the whole composer is read-only. Every expectation is a hand-written
 * literal asserted through the public API, never the input echoed back.
 */
class ComposerAttachmentPolicyTest {

    @Test
    fun `null permissions grant the full registered-user posture`() {
        val a = ComposerAttachmentPolicy.affordances(null)

        assertThat(a.canSendText).isTrue()
        assertThat(a.canSendImages).isTrue()
        assertThat(a.canSendFiles).isTrue()
        assertThat(a.canSendVideos).isTrue()
        assertThat(a.canSendAudios).isTrue()
        assertThat(a.canSendLocations).isTrue()
        assertThat(a.canSendLinks).isTrue()
        assertThat(a.showsAttachmentLadder).isTrue()
        assertThat(a.isReadOnly).isFalse()
    }

    @Test
    fun `defaultUser permissions grant every affordance`() {
        val a = ComposerAttachmentPolicy.affordances(ParticipantPermissions.defaultUser)

        assertThat(a.canSendText).isTrue()
        assertThat(a.canSendImages).isTrue()
        assertThat(a.canSendFiles).isTrue()
        assertThat(a.canSendVideos).isTrue()
        assertThat(a.canSendAudios).isTrue()
        assertThat(a.canSendLocations).isTrue()
        assertThat(a.canSendLinks).isTrue()
        assertThat(a.showsAttachmentLadder).isTrue()
        assertThat(a.isReadOnly).isFalse()
    }

    @Test
    fun `default anonymous posture allows only text and images, ladder still opens`() {
        val a = ComposerAttachmentPolicy.affordances(ParticipantPermissions.defaultAnonymous)

        assertThat(a.canSendText).isTrue()
        assertThat(a.canSendImages).isTrue()
        assertThat(a.canSendFiles).isFalse()
        assertThat(a.canSendVideos).isFalse()
        assertThat(a.canSendAudios).isFalse()
        assertThat(a.canSendLocations).isFalse()
        assertThat(a.canSendLinks).isFalse()
        // Images alone are enough to open the "+" ladder.
        assertThat(a.showsAttachmentLadder).isTrue()
        assertThat(a.isReadOnly).isFalse()
    }

    @Test
    fun `every capability denied makes the composer read-only with no ladder`() {
        val muted = ParticipantPermissions(
            canSendMessages = false,
            canSendFiles = false,
            canSendImages = false,
            canSendVideos = false,
            canSendAudios = false,
            canSendLocations = false,
            canSendLinks = false,
        )

        val a = ComposerAttachmentPolicy.affordances(muted)

        assertThat(a.canSendText).isFalse()
        assertThat(a.showsAttachmentLadder).isFalse()
        assertThat(a.isReadOnly).isTrue()
    }

    @Test
    fun `an asymmetric permission set maps field-for-field onto the affordances`() {
        val perms = ParticipantPermissions(
            canSendMessages = true,
            canSendFiles = false,
            canSendImages = true,
            canSendVideos = false,
            canSendAudios = true,
            canSendLocations = false,
            canSendLinks = true,
        )

        val a = ComposerAttachmentPolicy.affordances(perms)

        assertThat(a.canSendText).isTrue()
        assertThat(a.canSendFiles).isFalse()
        assertThat(a.canSendImages).isTrue()
        assertThat(a.canSendVideos).isFalse()
        assertThat(a.canSendAudios).isTrue()
        assertThat(a.canSendLocations).isFalse()
        assertThat(a.canSendLinks).isTrue()
        assertThat(a.showsAttachmentLadder).isTrue()
        assertThat(a.isReadOnly).isFalse()
    }

    @Test
    fun `locations alone open the attachment ladder`() {
        val perms = ParticipantPermissions(
            canSendMessages = true,
            canSendFiles = false,
            canSendImages = false,
            canSendVideos = false,
            canSendAudios = false,
            canSendLocations = true,
            canSendLinks = false,
        )

        val a = ComposerAttachmentPolicy.affordances(perms)

        assertThat(a.showsAttachmentLadder).isTrue()
        assertThat(a.isReadOnly).isFalse()
    }

    @Test
    fun `links alone never open the ladder — they ride inline in text`() {
        val perms = ParticipantPermissions(
            canSendMessages = true,
            canSendFiles = false,
            canSendImages = false,
            canSendVideos = false,
            canSendAudios = false,
            canSendLocations = false,
            canSendLinks = true,
        )

        val a = ComposerAttachmentPolicy.affordances(perms)

        assertThat(a.canSendLinks).isTrue()
        assertThat(a.showsAttachmentLadder).isFalse()
        assertThat(a.isReadOnly).isFalse()
    }

    @Test
    fun `text allowed but every attachment denied — composer usable, ladder hidden`() {
        val textOnly = ParticipantPermissions(
            canSendMessages = true,
            canSendFiles = false,
            canSendImages = false,
            canSendVideos = false,
            canSendAudios = false,
            canSendLocations = false,
            canSendLinks = false,
        )

        val a = ComposerAttachmentPolicy.affordances(textOnly)

        assertThat(a.canSendText).isTrue()
        assertThat(a.isReadOnly).isFalse()
        assertThat(a.showsAttachmentLadder).isFalse()
    }
}
