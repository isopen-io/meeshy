package me.meeshy.sdk.model.appearance

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.AttachmentProtection
import org.junit.Test

class ConversationBackgroundPhotoVerdictTest {

    @Test
    fun `une piece disparue ou refusee rend le fond a Signature`() {
        listOf(403, 404, 410).forEach { status ->
            assertThat(ConversationBackgroundPhotoVerdict.of(status)).isEqualTo(ConversationBackgroundPhotoVerdict.GONE)
        }
    }

    @Test
    fun `une panne passagere garde la derniere photo`() {
        listOf(null, 0, 401, 408, 429, 500, 502, 503).forEach { status ->
            assertThat(ConversationBackgroundPhotoVerdict.of(status)).isEqualTo(ConversationBackgroundPhotoVerdict.TRANSIENT)
        }
    }

    @Test
    fun `une piece chiffree depend d une cle de l appareil et n est jamais demandee au reseau`() {
        assertThat(ConversationBackgroundPhotoVerdict.source(isEncrypted = true)).isEqualTo(ConversationBackgroundPhotoVerdict.Source.NEEDS_DEVICE_KEY)
        assertThat(ConversationBackgroundPhotoVerdict.source(isEncrypted = false)).isEqualTo(ConversationBackgroundPhotoVerdict.Source.CLEAR)
        assertThat(ConversationBackgroundPhotoVerdict.source(isEncrypted = null)).isEqualTo(ConversationBackgroundPhotoVerdict.Source.CLEAR)
    }

    @Test
    fun `un verdict ne tranche que si la photo sondee est encore celle du fond`() {
        val shown = ConversationBackgroundResolution.Photo("a1", 0.3, 0)
        assertThat(ConversationBackgroundPhotoVerdict.settles("a1", shown)).isTrue()
        assertThat(ConversationBackgroundPhotoVerdict.settles("a2", shown)).isFalse()
        assertThat(ConversationBackgroundPhotoVerdict.settles("a1", ConversationBackgroundResolution.Signature)).isFalse()
    }

    @Test
    fun `le selecteur ne propose pas une photo chiffree, a vue unique ou floutee`() {
        assertThat(ConversationBackgroundPhotoVerdict.mayBeOffered(isEncrypted = null, isViewOnce = null, isBlurred = null)).isTrue()
        assertThat(ConversationBackgroundPhotoVerdict.mayBeOffered(isEncrypted = true, isViewOnce = false, isBlurred = false)).isFalse()
        assertThat(ConversationBackgroundPhotoVerdict.mayBeOffered(isEncrypted = false, isViewOnce = true, isBlurred = false)).isFalse()
        assertThat(ConversationBackgroundPhotoVerdict.mayBeOffered(isEncrypted = false, isViewOnce = false, isBlurred = true)).isFalse()
    }

    @Test
    fun `une pieces dont l effectFlags masque n est pas proposee`() {
        val masking = AttachmentProtection.MASKING_FLAGS
        assertThat(
            ConversationBackgroundPhotoVerdict.mayBeOffered(isEncrypted = false, isViewOnce = null, isBlurred = null, effectFlags = masking),
        ).isFalse()
    }
}
