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

    @Test
    fun `the presentation carries the participant to open and only an identified participant opens a profile`() {
        assertThat(JoinNoticePresentation.of(notice()).participantId).isEqualTo("p")
        assertThat(JoinNoticePresentation.of(notice()).opensProfile).isTrue()
        val blank = JoinNoticePresentation.of(JoinNoticeMetadata("", "Zoé"))
        assertThat(blank.opensProfile).isFalse()
    }

    @Test
    fun `an anonymous guest is announced with the masks and a named account with the person plus glyph`() {
        assertThat(JoinNoticePresentation.of(notice(anonymous = true)).glyph).isEqualTo(JoinNoticePresentation.Glyph.Masks)
        assertThat(JoinNoticePresentation.of(notice()).glyph).isEqualTo(JoinNoticePresentation.Glyph.PersonPlus)
    }

    @Test
    fun `entry rules and the detail row follow the link metadata`() {
        val rules = JoinNoticeMetadata.LinkRules(canSendMessages = true, canSendFiles = false, canSendImages = true)
        val withRules = JoinNoticePresentation.of(
            JoinNoticeMetadata("p", "Zoé", linkRules = rules),
        )
        assertThat(withRules.rules).isEqualTo(rules)
        assertThat(withRules.hasDetailRow).isTrue()
        assertThat(JoinNoticePresentation.of(notice()).hasDetailRow).isFalse()
        assertThat(JoinNoticePresentation.of(notice(username = "zoe")).hasDetailRow).isTrue()
    }

    @Test
    fun `the double tap hands the participation identity to the profile route`() {
        val user = JoinNoticePresentation.of(notice(givenName = "Zoé Martin")).toProfileSheetUser()
        assertThat(user.participantId).isEqualTo("p")
        assertThat(user.userId).isNull()
        assertThat(user.displayName).isEqualTo("Zoé Martin")
        assertThat(me.meeshy.sdk.model.profile.ProfileTapRoute.of(user))
            .isInstanceOf(me.meeshy.sdk.model.profile.ProfileTapRoute.Participation::class.java)
    }
}
