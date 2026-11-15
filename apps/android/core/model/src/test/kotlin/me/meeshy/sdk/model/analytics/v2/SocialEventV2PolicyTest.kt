package me.meeshy.sdk.model.analytics.v2

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class SocialEventV2PolicyTest {

    private fun byType() = sampleEvents().associateBy { it.type to it.action }.values

    @Test
    fun `seuls scroll playback et visibility sont echantillonnables`() {
        val sampleable = sampleEvents().filter { it.isSampleable }.map { it.type }.toSet()
        assertThat(sampleable).containsExactly(
            SocialEventV2Type.SCROLL, SocialEventV2Type.PLAYBACK, SocialEventV2Type.VISIBILITY,
        )
    }

    @Test
    fun `un visiteur ne peut produire que six types`() {
        val allowed = sampleEvents().filter { it.isAllowedForVisitor }.map { it.type }.toSet()
        assertThat(allowed).containsExactly(
            SocialEventV2Type.VISIBILITY, SocialEventV2Type.PLAYBACK, SocialEventV2Type.SCROLL,
            SocialEventV2Type.SCREEN_CAPTURE, SocialEventV2Type.LINK, SocialEventV2Type.DISCOVERY,
        )
    }

    @Test
    fun `interaction negatif story et notification sont refuses a un visiteur`() {
        val refused = sampleEvents().filterNot { it.isAllowedForVisitor }.map { it.type }.toSet()
        assertThat(refused).containsExactly(
            SocialEventV2Type.INTERACTION, SocialEventV2Type.NEGATIVE,
            SocialEventV2Type.STORY, SocialEventV2Type.NOTIFICATION,
        )
    }

    @Test
    fun `la politique se lit aussi sur l'evenement enveloppe`() {
        val e = event(scrollListing(), target = null)
        assertThat(e.isSampleable).isTrue()
        assertThat(e.isAllowedForVisitor).isTrue()
        assertThat(event(SocialInteraction(SocialInteraction.Action.SAVE)).isAllowedForVisitor).isFalse()
        assertThat(byType()).isNotEmpty()
    }
}
