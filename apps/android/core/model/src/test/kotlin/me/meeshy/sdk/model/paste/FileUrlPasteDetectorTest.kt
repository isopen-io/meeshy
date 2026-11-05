package me.meeshy.sdk.model.paste

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class FileUrlPasteDetectorTest {
    @Test
    fun `une adresse de fichier est retirée et son pourcentage décodé`() {
        val r = FileUrlPasteDetector.detect("voir file:///tmp/mon%20rapport.pdf merci")
        assertThat(r.paths).containsExactly("/tmp/mon rapport.pdf")
        assertThat(r.cleaned).isEqualTo("voir merci")
    }

    @Test
    fun `plusieurs adresses sont toutes retirées`() {
        val r = FileUrlPasteDetector.detect("file:///a/b.png file:///c/d.png")
        assertThat(r.paths).containsExactly("/a/b.png", "/c/d.png").inOrder()
        assertThat(r.cleaned).isEmpty()
    }

    @Test
    fun `un file isolé ou la racine seule sont des faux positifs`() {
        assertThat(FileUrlPasteDetector.detect("tape file:// pour voir").paths).isEmpty()
        assertThat(FileUrlPasteDetector.detect("file:///").paths).isEmpty()
        assertThat(FileUrlPasteDetector.detect("file:///").cleaned).isEqualTo("file:///")
    }

    @Test
    fun `un texte sans file reste intact`() {
        val r = FileUrlPasteDetector.detect("bonjour  le monde")
        assertThat(r.cleaned).isEqualTo("bonjour  le monde")
        assertThat(r.paths).isEmpty()
    }

    @Test
    fun `un plus littéral reste un plus`() {
        assertThat(FileUrlPasteDetector.detect("file:///a+b.txt").paths).containsExactly("/a+b.txt")
    }
}
