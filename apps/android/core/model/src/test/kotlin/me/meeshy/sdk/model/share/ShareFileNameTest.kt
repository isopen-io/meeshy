package me.meeshy.sdk.model.share

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class ShareFileNameTest {
    private fun name(vararg c: String?, ext: String = "jpeg") = ShareFileName.sanitizedOriginalName(c.toList(), ext)

    @Test
    fun `a path traversal keeps only the last component`() {
        assertThat(name("../../etc/passwd")).isEqualTo("passwd.jpeg")
        assertThat(name("..\\..\\boot.ini", ext = "bin")).isEqualTo("boot.ini")
    }

    @Test
    fun `bidi and control characters are stripped`() {
        assertThat(name("photo‮gpj.exe")).isEqualTo("photogpj.exe")
        assertThat(name("a\u0000b\u0007‏c.jpg")).isEqualTo("abc.jpg")
        assertThat(name("12:30 réunion.png")).isEqualTo("12_30 réunion.png")
    }

    @Test
    fun `leading dots and spaces are trimmed`() {
        assertThat(name("  ..cache.jpg  ")).isEqualTo("cache.jpg")
    }

    @Test
    fun `trailing dots do not double the extension dot`() {
        assertThat(name("photo.")).isEqualTo("photo.jpeg")
        assertThat(name("notes . ", ext = "txt")).isEqualTo("notes.txt")
        assertThat(name("...", " . ")).isNull()
    }

    @Test
    fun `a long name is capped and keeps its extension`() {
        val result = name("é".repeat(300) + ".MOV", ext = "mov")!!
        assertThat(result.toByteArray().size).isAtMost(ShareFileName.MAX_ORIGINAL_NAME_BYTES)
        assertThat(result).endsWith(".MOV")
    }

    @Test
    fun `a missing or unsafe extension gets the mime extension`() {
        assertThat(name("Document", ext = "pdf")).isEqualTo("Document.pdf")
        assertThat(name("clip.m\$v", ext = "mp4")).isEqualTo("clip.m\$v.mp4")
    }

    @Test
    fun `nothing usable is null and the next candidate wins`() {
        assertThat(name(null, "", "   ", "‮", "..", "/")).isNull()
        assertThat(name("", "IMG_2.heic")).isEqualTo("IMG_2.heic")
    }

    @Test
    fun `the copy extension comes from the source then the mime then bin`() {
        assertThat(ShareFileName.fileExtension("JPG", "image/png")).isEqualTo("jpg")
        assertThat(ShareFileName.fileExtension("../x", "image/png")).isEqualTo("png")
        assertThat(ShareFileName.fileExtension("", "application/x-unknown")).isEqualTo("bin")
    }
}
