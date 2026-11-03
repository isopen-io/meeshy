package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class JoinNoticePresentationTest {

    private fun notice(
        anonymous: Boolean = false,
        username: String? = null,
        givenName: String? = null,
        viaShareLink: Boolean = false,
    ) = JoinNoticeMetadata("p", "Zoé", anonymous, viaShareLink, username, givenName)

    @Test
    fun `a guest from a public link carries the no account badge and never a technical handle`() {
        val p = JoinNoticePresentation.of(notice(anonymous = true, username = "ano_zz", viaShareLink = true))
        assertThat(p.showsNoAccountBadge).isTrue()
        assertThat(p.handle).isNull()
    }

    @Test
    fun `a registered account keeps its handle even when it starts with ano_`() {
        assertThat(JoinNoticePresentation.of(notice(username = "ano_bob")).handle).isEqualTo("@ano_bob")
    }

    @Test
    fun `the given name wins and a handle equal to the name disappears`() {
        assertThat(JoinNoticePresentation.of(notice(givenName = "Zoé Martin")).primaryName).isEqualTo("Zoé Martin")
        assertThat(JoinNoticePresentation.of(notice(username = "Zoé")).handle).isNull()
    }
}
