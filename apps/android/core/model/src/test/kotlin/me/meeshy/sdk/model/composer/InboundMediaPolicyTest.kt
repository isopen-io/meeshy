package me.meeshy.sdk.model.composer

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class InboundMediaPolicyTest {
    private val own = "me.meeshy.app"

    private fun bytes(vararg head: Int, size: Int = 32) = ByteArray(size).also { head.forEachIndexed { i, b -> it[i] = b.toByte() } }
    private fun ftyp(brand: String) = bytes(0, 0, 0, 0x18, 0x66, 0x74, 0x79, 0x70).also { brand.forEachIndexed { i, c -> it[8 + i] = c.code.toByte() } }
    private val jpeg = bytes(0xFF, 0xD8, 0xFF, 0xE0)
    private val png = bytes(0x89, 0x50, 0x4E, 0x47)
    private val gif = bytes(0x47, 0x49, 0x46, 0x38)
    private val webp = bytes(0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50)

    private fun admitted(header: ByteArray, declared: String? = null) =
        InboundMediaPolicy.judge(header, header.size.toLong(), declared) as InboundMediaVerdict.Admitted

    private fun refused(header: ByteArray, total: Long = header.size.toLong(), declared: String? = null) =
        (InboundMediaPolicy.judge(header, total, declared) as InboundMediaVerdict.Refused).reason

    @Test
    fun `only a content uri of another app is a source`() {
        assertThat(InboundMediaPolicy.admitsSource("content", "com.android.providers.media.documents", own)).isTrue()
        assertThat(InboundMediaPolicy.admitsSource("CONTENT", "media", own)).isTrue()
        listOf("file", "android.resource", "http", "https", "intent", "javascript", "data", "", null).forEach {
            assertThat(InboundMediaPolicy.admitsSource(it, "media", own)).isFalse()
        }
    }

    @Test
    fun `a uri of our own providers is not a source, whatever its case or user prefix`() {
        listOf("me.meeshy.app.fileprovider", "ME.MEESHY.APP.FILEPROVIDER", "0@me.meeshy.app.fileprovider", "me.meeshy.app.androidx-startup", "me.meeshy.app").forEach {
            assertThat(InboundMediaPolicy.admitsSource("content", it, own)).isFalse()
        }
        assertThat(InboundMediaPolicy.admitsSource("content", null, own)).isFalse()
        assertThat(InboundMediaPolicy.admitsSource("content", "  ", own)).isFalse()
        assertThat(InboundMediaPolicy.admitsSource("content", "me.meeshy.application.media", own)).isTrue()
    }

    @Test
    fun `the type is what the bytes say`() {
        assertThat(admitted(jpeg).mimeType).isEqualTo("image/jpeg")
        assertThat(admitted(png).extension).isEqualTo("png")
        assertThat(admitted(gif).mimeType).isEqualTo("image/gif")
        assertThat(admitted(webp).mimeType).isEqualTo("image/webp")
        assertThat(admitted(ftyp("heic")).mimeType).isEqualTo("image/heic")
        assertThat(refused(ftyp("avif"))).isEqualTo(InboundMediaRefusal.UNRECOGNIZED)
        assertThat(admitted(ftyp("isom")).kind).isEqualTo(InboundMediaKind.VIDEO)
        assertThat(admitted(ftyp("mp42")).mimeType).isEqualTo("video/mp4")
        assertThat(admitted(ftyp("qt  ")).mimeType).isEqualTo("video/quicktime")
        assertThat(admitted(ftyp("3gp4")).mimeType).isEqualTo("video/3gpp")
        assertThat(admitted(bytes(0x1A, 0x45, 0xDF, 0xA3)).mimeType).isEqualTo("video/webm")
    }

    @Test
    fun `a video is never read as a heic image just because both start with ftyp`() {
        assertThat(admitted(ftyp("isom")).kind).isEqualTo(InboundMediaKind.VIDEO)
        assertThat(admitted(ftyp("mif1")).kind).isEqualTo(InboundMediaKind.IMAGE)
    }

    @Test
    fun `what is not a known image or video is refused, whatever it claims to be`() {
        val svg = "<svg xmlns='http://www.w3.org/2000/svg'><script>1</script></svg>".toByteArray()
        val html = "<!doctype html><script>alert(1)</script>".toByteArray()
        val zip = bytes(0x50, 0x4B, 0x03, 0x04)
        listOf(svg, html, zip, ftyp("zzzz"), bytes(0, 0, 0, 0)).forEach {
            assertThat(refused(it, declared = "image/png")).isEqualTo(InboundMediaRefusal.UNRECOGNIZED)
        }
        assertThat(refused(bytes(0xFF, 0xD8, 0xFF, size = 5))).isEqualTo(InboundMediaRefusal.UNRECOGNIZED)
    }

    @Test
    fun `a declared type that disagrees with the bytes is refused, an absent or generic one is not an argument`() {
        assertThat(refused(ftyp("mp42"), declared = "image/png")).isEqualTo(InboundMediaRefusal.DECLARED_TYPE_DISAGREES)
        assertThat(refused(jpeg, declared = "video/mp4")).isEqualTo(InboundMediaRefusal.DECLARED_TYPE_DISAGREES)
        assertThat(refused(jpeg, declared = "text/plain")).isEqualTo(InboundMediaRefusal.DECLARED_TYPE_DISAGREES)
        assertThat(admitted(jpeg, declared = null).mimeType).isEqualTo("image/jpeg")
        assertThat(admitted(jpeg, declared = "application/octet-stream").mimeType).isEqualTo("image/jpeg")
        assertThat(admitted(jpeg, declared = "image/*").mimeType).isEqualTo("image/jpeg")
        assertThat(admitted(jpeg, declared = "image/png").mimeType).isEqualTo("image/jpeg")
    }

    @Test
    fun `the size is bounded on what was read`() {
        assertThat(refused(jpeg, total = 0)).isEqualTo(InboundMediaRefusal.EMPTY)
        assertThat(refused(jpeg, total = InboundMediaPolicy.MAX_BYTES + 1)).isEqualTo(InboundMediaRefusal.TOO_LARGE)
        assertThat(InboundMediaPolicy.judge(jpeg, InboundMediaPolicy.MAX_BYTES, null)).isInstanceOf(InboundMediaVerdict.Admitted::class.java)
    }
}
