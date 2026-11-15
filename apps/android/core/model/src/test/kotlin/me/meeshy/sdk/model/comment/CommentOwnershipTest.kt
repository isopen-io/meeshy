package me.meeshy.sdk.model.comment

import com.google.common.truth.Truth.assertThat
import org.junit.Assert.assertThrows
import org.junit.Test
import java.util.Base64

class CommentOwnershipTest {
    private fun tokenFor(claims: String): String {
        val enc = Base64.getUrlEncoder().withoutPadding()
        return "h." + enc.encodeToString(claims.toByteArray()) + ".s"
    }

    @Test
    fun `le compte courant est l'auteur quand le jeton le designe`() {
        assertThat(CommentOwnership.tokenBound("u1", tokenFor("""{"userId":"u1"}"""))).isEqualTo(tokenFor("""{"userId":"u1"}"""))
    }

    @Test
    fun `un jeton d'un autre compte est refuse`() {
        assertThrows(CommentOwnershipRefusal::class.java) { CommentOwnership.tokenBound("u1", tokenFor("""{"userId":"u2"}""")) }
    }

    @Test
    fun `sans auteur, sans jeton ou jeton illisible rien ne part`() {
        listOf<Pair<String?, String?>>(
            null to tokenFor("""{"userId":"u1"}"""),
            "  " to tokenFor("""{"userId":"  "}"""),
            "u1" to null,
            "u1" to "",
            "u1" to "pas.un.jwt",
            "u1" to "a.b",
        ).forEach { (author, token) ->
            assertThrows(CommentOwnershipRefusal::class.java) { CommentOwnership.tokenBound(author, token) }
        }
    }

    @Test
    fun `deux chaines vides ne sont jamais le meme compte`() {
        assertThat(CommentOwnership.owns("", "")).isFalse()
        assertThat(CommentOwnership.owns(" u1 ", "u1")).isTrue()
    }

    @Test
    fun `une revendication userId non textuelle ne designe personne`() {
        assertThat(CommentOwnership.userIdInToken(tokenFor("""{"userId":12}"""))).isNull()
    }
}
