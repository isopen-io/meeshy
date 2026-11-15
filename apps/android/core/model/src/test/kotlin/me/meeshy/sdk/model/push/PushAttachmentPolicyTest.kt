package me.meeshy.sdk.model.push

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class PushAttachmentPolicyTest {

    @Test
    fun `une image sous le plafond peut etre attachee`() {
        assertThat(PushAttachmentPolicy.mayAttach("image/jpeg", 1_000L)).isTrue()
    }

    @Test
    fun `un audio avec parametres et casse quelconque est reconnu`() {
        assertThat(PushAttachmentPolicy.mayAttach("Audio/MP4; codecs=mp4a.40.2", 2_000L)).isTrue()
        assertThat(PushAttachmentPolicy.isAudioFamily(" AUDIO/aac ")).isTrue()
    }

    @Test
    fun `une video ou un document ne sont jamais attaches`() {
        assertThat(PushAttachmentPolicy.mayAttach("video/mp4", 1_000L)).isFalse()
        assertThat(PushAttachmentPolicy.mayAttach("application/pdf", 1_000L)).isFalse()
    }

    @Test
    fun `une taille absente ouvre le pre-vol`() {
        assertThat(PushAttachmentPolicy.mayAttach("image/png", null)).isTrue()
    }

    @Test
    fun `le plafond est inclusif et au dela est refuse`() {
        val max = PushAttachmentPolicy.MAX_ATTACHMENT_BYTES
        assertThat(max).isEqualTo(8L * 1024 * 1024)
        assertThat(PushAttachmentPolicy.mayAttach("image/png", max)).isTrue()
        assertThat(PushAttachmentPolicy.mayAttach("image/png", max + 1)).isFalse()
    }

    @Test
    fun `une taille nulle ou negative est refusee`() {
        assertThat(PushAttachmentPolicy.mayAttach("image/png", 0L)).isFalse()
        assertThat(PushAttachmentPolicy.mayAttach("image/png", -5L)).isFalse()
    }

    @Test
    fun `la taille mesuree apres telechargement est revérifiee`() {
        assertThat(PushAttachmentPolicy.mayKeepDownloaded(100L)).isTrue()
        assertThat(PushAttachmentPolicy.mayKeepDownloaded(0L)).isFalse()
        assertThat(PushAttachmentPolicy.mayKeepDownloaded(PushAttachmentPolicy.MAX_ATTACHMENT_BYTES + 1)).isFalse()
    }

    @Test
    fun `une taille declaree se lit en chaine ou en nombre`() {
        assertThat(PushAttachmentPolicy.declaredInt("1234")).isEqualTo(1234L)
        assertThat(PushAttachmentPolicy.declaredInt(" 42 ")).isEqualTo(42L)
        assertThat(PushAttachmentPolicy.declaredInt(99)).isEqualTo(99L)
        assertThat(PushAttachmentPolicy.declaredInt("abc")).isNull()
        assertThat(PushAttachmentPolicy.declaredInt("")).isNull()
        assertThat(PushAttachmentPolicy.declaredInt(null)).isNull()
    }

    @Test
    fun `une cle de localisation non vide declare une protection`() {
        assertThat(PushAttachmentPolicy.declaresProtection(mapOf("notificationLocKey" to "view_once"))).isTrue()
        assertThat(PushAttachmentPolicy.declaresProtection(mapOf("notificationLocKey" to "  "))).isFalse()
    }

    @Test
    fun `les bits ephemere flou et vue unique declarent une protection`() {
        listOf(1, 2, 4, 7).forEach {
            assertThat(PushAttachmentPolicy.declaresProtection(mapOf("effectFlags" to it.toString()))).isTrue()
        }
        assertThat(PushAttachmentPolicy.declaresProtection(mapOf("effectFlags" to "8"))).isFalse()
        assertThat(PushAttachmentPolicy.declaresProtection(emptyMap<String, Any?>())).isFalse()
    }

    @Test
    fun `une duree de vie ephemere positive declare une protection de duree`() {
        assertThat(PushAttachmentPolicy.declaresEphemeralDuration(mapOf("ephemeralDuration" to "30"))).isTrue()
        assertThat(PushAttachmentPolicy.declaresEphemeralDuration(mapOf("ephemeralDuration" to "0"))).isFalse()
        assertThat(PushAttachmentPolicy.declaresEphemeralDuration(emptyMap<String, Any?>())).isFalse()
    }

    @Test
    fun `un message protege ne declenche aucun telechargement`() {
        val protegee = mapOf("notificationLocKey" to "k")
        assertThat(PushAttachmentPolicy.shouldFetch(protegee, "image/png", 10L)).isFalse()
        assertThat(PushAttachmentPolicy.shouldFetch(mapOf("effectFlags" to "4"), "image/png", 10L)).isFalse()
        assertThat(PushAttachmentPolicy.shouldFetch(mapOf("ephemeralDuration" to "10"), "image/png", 10L)).isFalse()
        assertThat(PushAttachmentPolicy.shouldFetch(emptyMap<String, Any?>(), "image/png", 10L)).isTrue()
    }
}
