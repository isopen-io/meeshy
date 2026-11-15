package me.meeshy.sdk.model.call

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class CallHeaderLawTest {
    @Test
    fun `la porte vers la conversation exige un salon connu`() {
        assertThat(CallHeaderLaw.showsConversationButton("65f0")).isTrue()
        assertThat(CallHeaderLaw.showsConversationButton("")).isFalse()
        assertThat(CallHeaderLaw.showsConversationButton("  ")).isFalse()
        assertThat(CallHeaderLaw.showsConversationButton(null)).isFalse()
    }

    @Test
    fun `le bloc pair quitte le centre d'une scene video`() {
        assertThat(CallHeaderLaw.centersPeerBlock(isVideoStage = true)).isFalse()
        assertThat(CallHeaderLaw.centersPeerBlock(isVideoStage = false)).isTrue()
    }

    @Test
    fun `la qualite mesuree se projette sur la force du signal d'iOS`() {
        assertThat(CallHeaderLaw.signalStrength(ConnectionQuality.EXCELLENT)).isEqualTo(CallSignalStrength.EXCELLENT)
        assertThat(CallHeaderLaw.signalStrength(ConnectionQuality.FAIR)).isEqualTo(CallSignalStrength.FAIR)
        assertThat(CallHeaderLaw.signalStrength(ConnectionQuality.POOR)).isEqualTo(CallSignalStrength.POOR)
        assertThat(CallHeaderLaw.signalStrength(null)).isEqualTo(CallSignalStrength.CONNECTING)
        assertThat(CallHeaderLaw.signalStrength(ConnectionQuality.FAIR).isDegraded).isTrue()
    }

    private fun context(canEnterPip: Boolean = false, isPipActive: Boolean = false, hasConversation: Boolean = false) =
        CallHeaderContext(canEnterPip, isPipActive, hasConversation)

    @Test
    fun `un appel minimal n'offre que Reduire`() {
        assertThat(CallHeaderLaw.actions(context())).containsExactly(CallHeaderAction.Minimize)
    }

    @Test
    fun `l'en-tete dit Reduire, Image dans l'image, Conversation dans cet ordre`() {
        assertThat(CallHeaderLaw.actions(context(canEnterPip = true, hasConversation = true)))
            .containsExactly(CallHeaderAction.Minimize, CallHeaderAction.PictureInPicture, CallHeaderAction.Conversation).inOrder()
    }

    @Test
    fun `Image dans l'image reste offerte pour en sortir, Conversation exige un salon connu`() {
        assertThat(CallHeaderLaw.actions(context(isPipActive = true)))
            .containsExactly(CallHeaderAction.Minimize, CallHeaderAction.PictureInPicture).inOrder()
        assertThat(CallHeaderLaw.actions(context(canEnterPip = true))).doesNotContain(CallHeaderAction.Conversation)
        assertThat(CallHeaderLaw.actions(context(hasConversation = true))).doesNotContain(CallHeaderAction.PictureInPicture)
    }

    private fun input(
        layout: CallHeaderCapsuleLayout,
        isEstablished: Boolean = true,
        isNetworkDegraded: Boolean = false,
        givenName: String? = null,
        displayName: String? = null,
        groupName: String? = null,
        participantCount: Int = 0,
        receivesScreen: Boolean = false,
    ) = CallHeaderCapsuleInput(layout, isEstablished, isNetworkDegraded, givenName, displayName, groupName, participantCount, receivesScreen)

    @Test
    fun `en video la capsule dit le nom donne puis la duree, sinon le nom d'affichage`() {
        assertThat(CallHeaderLaw.capsule(input(CallHeaderCapsuleLayout.Video, givenName = "Awa", displayName = "Awa Diallo")))
            .isEqualTo(CallHeaderCapsule(title = "Awa", participantCount = null, showsDuration = true, showsNetwork = false))
        assertThat(CallHeaderLaw.capsule(input(CallHeaderCapsuleLayout.Video, givenName = "  ", displayName = "Awa Diallo"))?.title)
            .isEqualTo("Awa Diallo")
    }

    @Test
    fun `en video un ecran recu prend la place du nom et de la duree, la capsule dit Ecran de la personne`() {
        assertThat(CallHeaderLaw.capsule(input(CallHeaderCapsuleLayout.Video, givenName = "Awa", displayName = "Awa Diallo", receivesScreen = true)))
            .isEqualTo(CallHeaderCapsule(title = "Awa", participantCount = null, showsDuration = false, showsNetwork = false, isReceivedScreen = true))
    }

    @Test
    fun `un ecran recu garde le reseau degrade seulement`() {
        assertThat(CallHeaderLaw.capsule(input(CallHeaderCapsuleLayout.Video, displayName = "Awa", receivesScreen = true))?.showsNetwork).isFalse()
        assertThat(CallHeaderLaw.capsule(input(CallHeaderCapsuleLayout.Video, displayName = "Awa", isNetworkDegraded = true, receivesScreen = true))?.showsNetwork).isTrue()
    }

    @Test
    fun `l'ecran recu ne change ni la capsule audio ni celle du groupe`() {
        assertThat(CallHeaderLaw.capsule(input(CallHeaderCapsuleLayout.Audio, receivesScreen = true))).isNull()
        val group = CallHeaderLaw.capsule(input(CallHeaderCapsuleLayout.Group, groupName = "G", participantCount = 3, receivesScreen = true))
        assertThat(group?.isReceivedScreen).isFalse()
        assertThat(group?.showsDuration).isTrue()
    }

    @Test
    fun `le reseau n'apparait dans la capsule que degrade`() {
        assertThat(CallHeaderLaw.capsule(input(CallHeaderCapsuleLayout.Video, givenName = "Awa"))?.showsNetwork).isFalse()
        assertThat(CallHeaderLaw.capsule(input(CallHeaderCapsuleLayout.Video, isNetworkDegraded = true, givenName = "Awa"))?.showsNetwork).isTrue()
    }

    @Test
    fun `en audio la capsule n'existe que pour le reseau degrade, seul`() {
        assertThat(CallHeaderLaw.capsule(input(CallHeaderCapsuleLayout.Audio, givenName = "Awa"))).isNull()
        assertThat(CallHeaderLaw.capsule(input(CallHeaderCapsuleLayout.Audio, isNetworkDegraded = true, givenName = "Awa")))
            .isEqualTo(CallHeaderCapsule(title = null, participantCount = null, showsDuration = false, showsNetwork = true))
    }

    @Test
    fun `en groupe la capsule dit le nom du groupe, le nombre puis la duree, meme en audio`() {
        assertThat(CallHeaderLaw.capsule(input(CallHeaderCapsuleLayout.Group, groupName = "Les Copains", participantCount = 5)))
            .isEqualTo(CallHeaderCapsule(title = "Les Copains", participantCount = 5, showsDuration = true, showsNetwork = false))
        val unnamed = CallHeaderLaw.capsule(input(CallHeaderCapsuleLayout.Group, participantCount = 3))
        assertThat(unnamed?.title).isNull()
        assertThat(unnamed?.participantCount).isEqualTo(3)
    }

    @Test
    fun `avant l'etablissement de l'appel la capsule n'existe jamais`() {
        for (layout in CallHeaderCapsuleLayout.values()) {
            assertThat(CallHeaderLaw.capsule(input(layout, isEstablished = false, isNetworkDegraded = true, givenName = "A", groupName = "G", participantCount = 4))).isNull()
        }
    }

    @Test
    fun `les noms de la capsule se lisent dans la conversation en cache`() {
        fun info(type: String, title: String?, customName: String? = null) =
            me.meeshy.sdk.model.call.frames.CallFrameConversationInfo(type, customName, title, null, null)
        assertThat(CallHeaderNames.resolve(info("direct", "Awa Diallo", " Maman "), null)).isEqualTo(CallHeaderNames(givenName = "Maman", groupName = null))
        assertThat(CallHeaderNames.resolve(info("direct", "Awa Diallo"), null).givenName).isNull()
        assertThat(CallHeaderNames.resolve(info("group", "Titre", "Ma bande"), "Maillage").groupName).isEqualTo("Ma bande")
        assertThat(CallHeaderNames.resolve(info("group", "Titre"), "Maillage").groupName).isEqualTo("Titre")
        assertThat(CallHeaderNames.resolve(null, "Maillage").groupName).isEqualTo("Maillage")
        assertThat(CallHeaderNames.resolve(null, null)).isEqualTo(CallHeaderNames(null, null))
    }
}
