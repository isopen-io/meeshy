package me.meeshy.sdk.composer

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.ParticipantPermissions
import me.meeshy.sdk.model.guest.GuestAttachmentAllowance
import me.meeshy.sdk.model.guest.GuestAttachmentKind
import org.junit.Test

/** Un lien restreint (World Wide : texte et audio) ne montre que les portes dont la famille est ouverte (iOS `guestDoor`). */
class ComposerGuestAllowanceTest {
    private val guest = ParticipantPermissions.anonymous(canSendMessages = true, canSendFiles = true, canSendImages = true)
    private val textAndAudio = GuestAttachmentAllowance(listOf(GuestAttachmentKind.TEXT, GuestAttachmentKind.AUDIO))

    @Test
    fun `un lien sans restriction laisse les droits durcis tels quels`() {
        assertThat(ComposerAttachmentPolicy.affordances(guest, GuestAttachmentAllowance.UNRESTRICTED))
            .isEqualTo(ComposerAttachmentPolicy.affordances(guest))
    }

    @Test
    fun `texte et audio ferment l image, le lieu et ouvrent le micro et les fichiers`() {
        val a = ComposerAttachmentPolicy.affordances(guest, textAndAudio)
        assertThat(a.canSendImages).isFalse()
        assertThat(a.canSendLocations).isFalse()
        assertThat(a.canSendAudios).isTrue()
        assertThat(a.canSendFiles).isTrue()
        assertThat(a.canSendText).isTrue()
    }

    @Test
    fun `un droit refuse par le serveur ne se rouvre pas par une famille`() {
        val noFiles = ParticipantPermissions.anonymous(canSendMessages = true, canSendFiles = false, canSendImages = true)
        assertThat(ComposerAttachmentPolicy.affordances(noFiles, textAndAudio).canSendFiles).isFalse()
    }

    @Test
    fun `aucune famille ouverte ferme tout sauf le texte`() {
        val a = ComposerAttachmentPolicy.affordances(guest, GuestAttachmentAllowance.CLOSED)
        assertThat(a.showsAttachmentLadder).isFalse()
        assertThat(a.canSendText).isTrue()
    }

    @Test
    fun `une famille image ouvre les images meme si le droit canSendFiles est ferme`() {
        val imagesOnly = GuestAttachmentAllowance(listOf(GuestAttachmentKind.IMAGE))
        val a = ComposerAttachmentPolicy.affordances(guest, imagesOnly)
        assertThat(a.canSendImages).isTrue()
        assertThat(a.canSendFiles).isTrue()
        assertThat(a.canSendAudios).isFalse()
    }
}
