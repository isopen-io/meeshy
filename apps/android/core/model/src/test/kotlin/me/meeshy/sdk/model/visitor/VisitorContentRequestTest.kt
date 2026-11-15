package me.meeshy.sdk.model.visitor

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class VisitorContentRequestTest {

    private fun request(uri: String) = VisitorContentRequest.fromUri(uri)

    @Test
    fun `un lien de publication canonique est une publication`() {
        assertThat(request("https://meeshy.me/feeds/post/64f0a1b2c3d4e5f607182930"))
            .isEqualTo(VisitorContentRequest("64f0a1b2c3d4e5f607182930", VisitorContentKind.POST, via = null))
    }

    @Test
    fun `les alias de publication ouvrent la meme destination`() {
        listOf("/feeds/p/abc", "/post/abc", "/p/abc", "/feeds/post/abc/").forEach { path ->
            assertThat(request("https://www.meeshy.me$path")?.kind).isEqualTo(VisitorContentKind.POST)
        }
    }

    @Test
    fun `un reel vient de reel ou de la porte reels seed`() {
        assertThat(request("https://meeshy.me/reel/r1")).isEqualTo(VisitorContentRequest("r1", VisitorContentKind.REEL, null))
        assertThat(request("https://meeshy.me/reels?seed=r2")).isEqualTo(VisitorContentRequest("r2", VisitorContentKind.REEL, null))
        assertThat(request("https://meeshy.me/reels")).isNull()
    }

    @Test
    fun `une story vient de story stories ou s`() {
        listOf("story", "stories", "s").forEach {
            assertThat(request("https://meeshy.me/$it/s1")).isEqualTo(VisitorContentRequest("s1", VisitorContentKind.STORY, null))
        }
    }

    @Test
    fun `le jeton via se garde, valide, et jamais le fragment`() {
        assertThat(request("https://meeshy.me/post/p1?via=abc_12")?.via).isEqualTo("abc_12")
        assertThat(request("https://meeshy.me/post/p1?via=a%20b")?.via).isNull()
        assertThat(request("https://meeshy.me/post/p1#via=zzz")?.via).isNull()
    }

    @Test
    fun `seule l origine https de Meeshy ouvre un contenu visiteur`() {
        listOf(
            "http://meeshy.me/post/p1",
            "https://meeshy.me.evil.com/post/p1",
            "https://evil.com/post/p1",
            "https://user@meeshy.me/post/p1",
            "https://meeshy.me:8443/post/p1",
            "meeshy://post/p1",
            "",
        ).forEach { assertThat(request(it)).isNull() }
        assertThat(request("HTTPS://MEESHY.ME/post/p1")).isNotNull()
        assertThat(request("https://meeshy.me:443/post/p1")).isNotNull()
    }

    @Test
    fun `un identifiant douteux ou un segment en trop ne mene nulle part`() {
        listOf(
            "https://meeshy.me/post/",
            "https://meeshy.me/post/a%2Fb",
            "https://meeshy.me/post/a b",
            "https://meeshy.me/post/p1/extra",
            "https://meeshy.me/feeds/post",
            "https://meeshy.me/feeds/other/p1",
            "https://meeshy.me/auth/reset-password?token=x",
            "https://meeshy.me/chat/abc",
        ).forEach { assertThat(request(it)).isNull() }
    }

    @Test
    fun `l identite d une demande compte le jeton via`() {
        assertThat(VisitorContentRequest("p", VisitorContentKind.POST, "t").id).isNotEqualTo(VisitorContentRequest("p", VisitorContentKind.POST, null).id)
    }
}
