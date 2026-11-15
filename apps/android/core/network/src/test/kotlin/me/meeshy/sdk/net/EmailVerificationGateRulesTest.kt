package me.meeshy.sdk.net

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class EmailVerificationGateRulesTest {

    private val PREFIX = "/api/v1/"

    @Test
    fun `les cinq routes gardees ont leur raison, avec ou sans prefixe d'API`() {
        fun reason(path: String) = EmailVerificationGateRules.reason("POST", path, PREFIX)

        assertThat(reason("/api/v1/posts")).isEqualTo(EmailGateReason.PUBLISH)
        assertThat(reason("/api/v1/posts/from-attachment")).isEqualTo(EmailGateReason.PUBLISH)
        assertThat(reason("/api/v1/invitations/email")).isEqualTo(EmailGateReason.INVITE)
        assertThat(reason("/api/v1/links")).isEqualTo(EmailGateReason.LINK)
        assertThat(reason("/api/v1/conversations/abc123/new-link")).isEqualTo(EmailGateReason.LINK)
        assertThat(reason("/posts")).isEqualTo(EmailGateReason.PUBLISH)
        assertThat(reason("/api/v1/posts?draft=1")).isEqualTo(EmailGateReason.PUBLISH)
    }

    @Test
    fun `toute autre requete passe sans garde`() {
        assertThat(EmailVerificationGateRules.reason("GET", "/api/v1/posts", PREFIX)).isNull()
        assertThat(EmailVerificationGateRules.reason("POST", "/api/v1/posts/p1/comments", PREFIX)).isNull()
        assertThat(EmailVerificationGateRules.reason("POST", "/api/v1/links/stats", PREFIX)).isNull()
        assertThat(EmailVerificationGateRules.reason("POST", "/api/v1/conversations//new-link", PREFIX)).isNull()
        assertThat(EmailVerificationGateRules.reason("POST", "/api/v1/conversations/a/b/new-link", PREFIX)).isNull()
        assertThat(EmailVerificationGateRules.reason("POST", "/api/v1/conversations/c1/messages", PREFIX)).isNull()
    }

    @Test
    fun `seul inviter est retenu d'avance`() {
        assertThat(EmailVerificationGateRules.isHeldBack(EmailGateReason.INVITE)).isTrue()
        assertThat(EmailVerificationGateRules.isHeldBack(EmailGateReason.PUBLISH)).isFalse()
        assertThat(EmailVerificationGateRules.isHeldBack(EmailGateReason.LINK)).isFalse()
    }

    @Test
    fun `un lien refuse au plafond devient plus de liens, toute autre raison reste la sienne`() {
        val cap = EmailVerificationGateRules.SHARE_LINK_CAP_REFUSAL

        assertThat(EmailVerificationGateRules.reasonAfterRefusal(EmailGateReason.LINK, cap)).isEqualTo(EmailGateReason.MORE_LINKS)
        assertThat(EmailVerificationGateRules.reasonAfterRefusal(EmailGateReason.LINK, "Email verification required")).isEqualTo(EmailGateReason.LINK)
        assertThat(EmailVerificationGateRules.reasonAfterRefusal(EmailGateReason.PUBLISH, cap)).isEqualTo(EmailGateReason.PUBLISH)
        assertThat(EmailVerificationGateRules.reasonAfterRefusal(EmailGateReason.LINK, null)).isEqualTo(EmailGateReason.LINK)
    }
}
