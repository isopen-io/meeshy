package me.meeshy.sdk.model.game.ceremony

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.game.MeeshEdition
import org.junit.Test

class MintCeremonyParticlesTest {

    private val prism = GameMintCeremony.plan(MeeshEdition.Prism, MintCeremonyMode.Normal)

    @Test
    fun `la meme piece tisse le meme cercle`() {
        val a = MintCeremonyParticles.build(prism, seed = 92)
        val b = MintCeremonyParticles.build(prism, seed = 92)
        assertThat(a.weave).isEqualTo(b.weave)
        assertThat(a.dust).isEqualTo(b.dust)
        assertThat(a.bursts).isEqualTo(b.bursts)
    }

    @Test
    fun `un autre numero tisse un autre cercle`() {
        val a = MintCeremonyParticles.build(prism, seed = 92)
        val b = MintCeremonyParticles.build(prism, seed = 93)
        assertThat(a.weave.first()).isNotEqualTo(b.weave.first())
    }

    @Test
    fun `le budget de particules est tenu et le pas de deux allege la peinture`() {
        val particles = MintCeremonyParticles.build(prism, seed = 1000)
        assertThat(particles.weave.size + particles.dust.size).isAtMost(GameMintCeremony.PARTICLE_BUDGET)
        val full = particles.paint(prism, 2.7)
        val half = particles.paint(prism, 2.7, stride = 2)
        assertThat(half.painted).isLessThan(full.painted)
        assertThat(full.painted).isGreaterThan(3000)
        assertThat(full.batches.size).isLessThan(300)
    }
}
