package me.meeshy.sdk.model.call.frames

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/**
 * La mise en avant des cadres (#12683), miroir de `CallFrameSpotlightRule` d'iOS : le carrousel ouvre
 * d'office quelques ambiances et leurs vedettes, « Plus d'ambiances » montre tout le catalogue, et un
 * cadre choisi hors de la mise en avant reste visible.
 */
class CallFrameSpotlightRuleTest {

    private val duo = 2

    @Test
    fun `la mise en avant se lit du fichier partage, dans son ordre`() {
        val spotlight = CallFrameCatalogue.spotlight

        assertThat(spotlight.map { it.mood }.take(3)).containsExactly(CallFrameMood.SIGNATURE, CallFrameMood.JOVIAL, CallFrameMood.FEERIQUE).inOrder()
        assertThat(spotlight.first().featured).containsExactly("signature.aurore", "signature.prisme", "signature.bulle").inOrder()
    }

    @Test
    fun `un fichier illisible ne met rien en avant`() {
        assertThat(CallFrameSpotlightRule.parse("pas du json")).isEmpty()
        assertThat(CallFrameSpotlightRule.parse("""{"moods":[{"mood":"inconnue","featured":["a.b"]}]}""")).isEmpty()
    }

    @Test
    fun `ouvertes d'office, les ambiances suivent la mise en avant, tout le catalogue suit l'ordre canonique`() {
        val featured = CallFrameSpotlightRule.moods(duo, CallFrameScope.SPOTLIGHT)
        val all = CallFrameSpotlightRule.moods(duo, CallFrameScope.ALL)

        assertThat(featured).isEqualTo(CallFrameCatalogue.spotlight.map { it.mood }.filter { it in CallFrameCatalogue.moods(duo) })
        assertThat(all).isEqualTo(CallFrameCatalogue.moods(duo))
    }

    @Test
    fun `ouverte d'office, une ambiance ne montre que ses vedettes, dans leur ordre`() {
        val frames = CallFrameSpotlightRule.frames(duo, CallFrameMood.SIGNATURE, CallFrameScope.SPOTLIGHT)

        assertThat(frames.map { it.motif }).containsExactly("signature.aurore", "signature.prisme", "signature.bulle").inOrder()
        assertThat(CallFrameSpotlightRule.frames(duo, CallFrameMood.SIGNATURE, CallFrameScope.ALL))
            .isEqualTo(CallFrameCatalogue.frames(duo, CallFrameMood.SIGNATURE))
    }

    @Test
    fun `sans vedette pour n, une ambiance montre tout ce qui sert n`() {
        val none = listOf(CallFrameSpotlight(CallFrameMood.SIGNATURE, listOf("signature.absent")))

        assertThat(CallFrameSpotlightRule.frames(duo, CallFrameMood.SIGNATURE, CallFrameScope.SPOTLIGHT, spotlight = none))
            .isEqualTo(CallFrameCatalogue.frames(duo, CallFrameMood.SIGNATURE))
    }

    @Test
    fun `un cadre choisi hors de la mise en avant ouvre tout le catalogue`() {
        val hidden = CallFrameCatalogue.frames(duo).first { candidate ->
            CallFrameSpotlightRule.frames(duo, candidate.mood, CallFrameScope.SPOTLIGHT).none { it.id == candidate.id }
        }
        val featured = CallFrameSpotlightRule.frames(duo, CallFrameMood.SIGNATURE, CallFrameScope.SPOTLIGHT).first()

        assertThat(CallFrameSpotlightRule.scope(hidden.id, duo, CallFrameScope.SPOTLIGHT)).isEqualTo(CallFrameScope.ALL)
        assertThat(CallFrameSpotlightRule.scope(featured.id, duo, CallFrameScope.SPOTLIGHT)).isEqualTo(CallFrameScope.SPOTLIGHT)
        assertThat(CallFrameSpotlightRule.scope(null, duo, CallFrameScope.SPOTLIGHT)).isEqualTo(CallFrameScope.SPOTLIGHT)
        assertThat(CallFrameSpotlightRule.scope(featured.id, duo, CallFrameScope.ALL)).isEqualTo(CallFrameScope.ALL)
    }

    @Test
    fun `Plus d'ambiances ne s'offre que s'il revele quelque chose`() {
        assertThat(CallFrameSpotlightRule.hidesFrames(duo)).isTrue()

        val everything = CallFrameCatalogue.moods(duo).map { mood ->
            CallFrameSpotlight(mood, CallFrameCatalogue.frames(duo, mood).map { it.motif }.distinct())
        }
        assertThat(CallFrameSpotlightRule.hidesFrames(duo, spotlight = everything)).isFalse()
    }
}
