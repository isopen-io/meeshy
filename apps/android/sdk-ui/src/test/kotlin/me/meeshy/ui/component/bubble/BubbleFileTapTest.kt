package me.meeshy.ui.component.bubble

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/** #13822 — une vidéo protégée du fil répond au toucher (lecteur sécurisé), un autre fichier protégé jamais (#13492). */
class BubbleFileTapTest {
    private fun file(isVideo: Boolean = false, isProtected: Boolean = false, isSealed: Boolean = false, url: String? = "https://g/x") =
        BubbleFile(attachmentId = "a", name = "x", url = url, isVideo = isVideo, isProtected = isProtected, isSealed = isSealed)

    @Test
    fun `un fichier ou une video en clair repondent au toucher`() {
        assertThat(file().opensOnTap).isTrue()
        assertThat(file(isVideo = true).opensOnTap).isTrue()
    }

    @Test
    fun `une video protegee repond au toucher, un fichier protege non`() {
        assertThat(file(isVideo = true, isProtected = true).opensOnTap).isTrue()
        assertThat(file(isProtected = true).opensOnTap).isFalse()
    }

    @Test
    fun `une piece scellee ou sans adresse ne repond jamais`() {
        assertThat(file(isVideo = true, isSealed = true).opensOnTap).isFalse()
        assertThat(file(isVideo = true, url = null).opensOnTap).isFalse()
        assertThat(file(url = " ").opensOnTap).isFalse()
    }
}
