package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/**
 * #13790 — réagir, épingler, désépingler et supprimer pour tous partent en SIGNAUX chiffrés en bout en bout, que l'Android
 * natif ne sait pas sceller : le geste n'existe que vers une conversation CONNUE claire.
 */
class PlainSignalAdmissionTest {

    @Test
    fun `seule une conversation connue claire offre les gestes en clair`() {
        assertThat(PlainSignalAdmission.offers(ConversationClearance.CLEAR)).isTrue()
        assertThat(PlainSignalAdmission.offers(ConversationClearance.END_TO_END)).isFalse()
        assertThat(PlainSignalAdmission.offers(ConversationClearance.UNKNOWN)).isFalse()
    }

    @Test
    fun `un fil qui montre du bout en bout ferme une conversation servie claire`() {
        assertThat(PlainSignalAdmission.clearanceOf(ConversationClearance.CLEAR, threadShowsEndToEnd = true))
            .isEqualTo(ConversationClearance.END_TO_END)
        assertThat(PlainSignalAdmission.clearanceOf(ConversationClearance.UNKNOWN, threadShowsEndToEnd = true))
            .isEqualTo(ConversationClearance.END_TO_END)
    }

    @Test
    fun `un fil sans bout en bout garde ce que l'appareil sait de la conversation`() {
        ConversationClearance.entries.forEach { known ->
            assertThat(PlainSignalAdmission.clearanceOf(known, threadShowsEndToEnd = false)).isEqualTo(known)
        }
    }

    @Test
    fun `l'interface ne dit le bout en bout que lorsqu'il est su, jamais sur un mode inconnu`() {
        assertThat(PlainSignalAdmission.saysWhy(ConversationClearance.END_TO_END)).isTrue()
        assertThat(PlainSignalAdmission.saysWhy(ConversationClearance.UNKNOWN)).isFalse()
        assertThat(PlainSignalAdmission.saysWhy(ConversationClearance.CLEAR)).isFalse()
    }
}
