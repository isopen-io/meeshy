package me.meeshy.app.navigation

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.visitor.VisitorContentKind
import org.junit.Test

class VisitorLinkGateTest {
    private val post = "https://meeshy.me/feeds/post/p1?via=tok"
    private val view = "android.intent.action.VIEW"

    @Test
    fun `un lien de contenu ouvert sans session devient une demande visiteur`() {
        val request = VisitorLinkGate.divert(action = view, dataString = post, signedIn = false)
        assertThat(request?.postId).isEqualTo("p1")
        assertThat(request?.kind).isEqualTo(VisitorContentKind.POST)
        assertThat(request?.via).isEqualTo("tok")
    }

    @Test
    fun `avec une session, compte ou invitee, le lien suit son chemin habituel`() {
        assertThat(VisitorLinkGate.divert(view, post, signedIn = true)).isNull()
    }

    @Test
    fun `seule une action VIEW porte un lien`() {
        assertThat(VisitorLinkGate.divert("android.intent.action.SEND", post, signedIn = false)).isNull()
        assertThat(VisitorLinkGate.divert(null, post, signedIn = false)).isNull()
    }

    @Test
    fun `un lien qui n est pas un contenu public ne detourne rien`() {
        assertThat(VisitorLinkGate.divert(view, "https://meeshy.me/chat/abc", signedIn = false)).isNull()
        assertThat(VisitorLinkGate.divert(view, "https://meeshy.me/auth/magic-link?token=x", signedIn = false)).isNull()
    }
}
