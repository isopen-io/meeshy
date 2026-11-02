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

    // ── #13804 — supprimer pour tous se juge sur la LIGNE du message, comme la passerelle (`messageRefusesPlainErasure`) ──

    @Test
    fun `une ligne que le serveur lit deja s'efface pour tous quel que soit le mode de la conversation`() {
        ConversationClearance.entries.forEach { clearance ->
            assertThat(PlainSignalAdmission.offersErasure(clearance, rowReadByServer = true)).isTrue()
        }
    }

    @Test
    fun `une ligne scellee ne s'efface pour tous que vers une conversation connue claire`() {
        assertThat(PlainSignalAdmission.offersErasure(ConversationClearance.CLEAR, rowReadByServer = false)).isTrue()
        assertThat(PlainSignalAdmission.offersErasure(ConversationClearance.END_TO_END, rowReadByServer = false)).isFalse()
        assertThat(PlainSignalAdmission.offersErasure(ConversationClearance.UNKNOWN, rowReadByServer = false)).isFalse()
    }

    @Test
    fun `le serveur lit une ligne en clair ou chiffree par lui, jamais une ligne de bout en bout ou au mode inconnu`() {
        assertThat(PlainSignalAdmission.rowReadByServer(isEncrypted = null, encryptionMode = null)).isTrue()
        assertThat(PlainSignalAdmission.rowReadByServer(isEncrypted = false, encryptionMode = null)).isTrue()
        assertThat(PlainSignalAdmission.rowReadByServer(isEncrypted = true, encryptionMode = " Server ")).isTrue()
        assertThat(PlainSignalAdmission.rowReadByServer(isEncrypted = true, encryptionMode = "hybrid")).isTrue()
        assertThat(PlainSignalAdmission.rowReadByServer(isEncrypted = true, encryptionMode = "e2ee")).isFalse()
        assertThat(PlainSignalAdmission.rowReadByServer(isEncrypted = true, encryptionMode = null)).isFalse()
        assertThat(PlainSignalAdmission.rowReadByServer(isEncrypted = false, encryptionMode = "e2ee")).isFalse()
        assertThat(PlainSignalAdmission.rowReadByServer(isEncrypted = true, encryptionMode = "future-mode")).isFalse()
    }
}
