package me.meeshy.sdk.model.game.ceremony

import com.google.common.truth.Truth.assertThat
import com.google.common.truth.Truth.assertWithMessage
import me.meeshy.sdk.model.game.MeeshEdition
import org.junit.Test

/**
 * LA SCÈNE DE LA FRAPPE, image par image (iOS `MintCeremonyTests`) : la frappe arrive en dernier, le marteau reste
 * levé tant que la passerelle se tait, un refus ramène la lumière, « réduire les animations » n'en garde que l'état
 * final — et la scène est la MÊME que celle du web et d'iOS, nombre pour nombre (valeurs relevées sur
 * `apps/web/src/lib/game/choreography-mint-ceremony.ts`, reprises de `MintCeremonyTests.swift`).
 */
class MintCeremonySceneTest {

    private fun plan(edition: MeeshEdition, mode: MintCeremonyMode = MintCeremonyMode.Normal, answeredAtMs: Double? = null) =
        GameMintCeremony.plan(edition = edition, mode = mode, answeredAtMs = answeredAtMs)

    @Test
    fun while_the_gateway_is_silent_meo_keeps_the_hammer_raised_and_nothing_is_struck() {
        val live = MintCeremonyRun.livePlan(MeeshEdition.Silver, mode = MintCeremonyMode.Normal, answeredAtMs = null, nowMs = 5500.0, modest = false)
        val frame = MintCeremonyChoreography.frame(live, 5.5)
        assertThat(frame.hammerMeo.angle).isGreaterThan(MintCeremonyStage.WIND - 3)
        assertThat(frame.coin.engraved).isEqualTo(0.0)
        assertThat(frame.flash).isEqualTo(0.0)
        assertThat(frame.ring.opacity).isEqualTo(0.0)
    }

    @Test
    fun the_engraving_and_the_wave_appear_under_the_hammer_only_at_the_blow() {
        val silver = plan(MeeshEdition.Silver)
        val impact = silver.strikes[0].impactMs / 1000.0
        assertThat(MintCeremonyChoreography.frame(silver, impact - 0.01).coin.engraved).isEqualTo(0.0)
        assertThat(MintCeremonyChoreography.frame(silver, impact - 0.01).ring.opacity).isEqualTo(0.0)
        assertThat(MintCeremonyChoreography.frame(silver, impact + 0.2).coin.engraved).isEqualTo(1.0)
        assertThat(MintCeremonyChoreography.frame(silver, impact + 0.05).flash).isGreaterThan(0.5)
        assertWithMessage("l'onde part du coup").that(MintCeremonyChoreography.frame(silver, impact + 0.1).ring.opacity).isGreaterThan(0.5)
    }

    @Test
    fun the_prism_scene_is_the_web_scene_number_for_number() {
        val frame = MintCeremonyChoreography.frame(plan(MeeshEdition.Prism), 6.2)
        assertThat(frame.hammerMeo.x).isWithin(1e-9).of(260.0)
        assertThat(frame.hammerMeo.y).isWithin(1e-9).of(347.7433158698748)
        assertThat(frame.hammerMeo.angle).isWithin(1e-9).of(-54.0)
        assertThat(frame.coin.y).isWithin(1e-9).of(488.0)
        assertThat(frame.coin.scale).isWithin(1e-9).of(0.7733333333333333)
        assertThat(frame.coin.squash).isWithin(1e-9).of(0.9783688103937541)
        assertThat(frame.mee.y).isWithin(1e-9).of(406.9971571709854)
        assertThat(frame.tchak.opacity).isWithin(1e-9).of(0.125)
        assertThat(frame.tchak.scale).isWithin(1e-9).of(0.8798699999999984)
        assertThat(frame.tchak.isFinal).isTrue()
        assertThat(frame.flash).isWithin(1e-9).of(0.95)
    }

    @Test
    fun the_prism_last_blow_is_struck_by_mee_and_meo_together() {
        val prism = plan(MeeshEdition.Prism)
        val last = prism.strikes[2].atMs / 1000.0
        assertThat(MintCeremonyChoreography.frame(prism, last - 0.3).hammerMee.opacity).isGreaterThan(0.99)
        assertThat(MintCeremonyChoreography.frame(plan(MeeshEdition.Gold), last).hammerMee.opacity).isEqualTo(0.0)
    }

    @Test
    fun the_particles_are_drawn_from_the_web_generator() {
        val particles = MintCeremonyParticles.build(plan(MeeshEdition.Prism), seed = 92)
        val first = particles.weave.minBy { it.s }
        assertThat(first.s).isWithin(1e-12).of(0.3508397487822702)
        assertThat(first.d).isWithin(1e-12).of(0.7079464781098068)
        assertThat(first.delta).isWithin(1e-12).of(-2.094446391185509)
        assertThat(first.jitter).isWithin(1e-12).of(-1.2358591735363007)
        assertThat(first.tone).isEqualTo(3)
        val diamond = particles.dust.first { it.material == MintCeremonyDustMaterial.Diamond && it.tone == 2 }
        assertThat(diamond.origin.x).isWithin(1e-9).of(95.94014560477808)
        assertThat(diamond.control.y).isWithin(1e-9).of(225.94781038970837)
        assertThat(diamond.size).isWithin(1e-12).of(1.1347782586701214)
        assertThat(particles.bursts[0].vx).isWithin(1e-9).of(165.70766558721166)
        assertThat(particles.puff[0].vx).isWithin(1e-9).of(-121.34692908031866)
    }

    @Test
    fun the_weave_and_dust_stay_within_the_budget_and_halve_on_a_modest_device() {
        MeeshEdition.entries.forEach { edition ->
            val full = MintCeremonyParticles.build(plan(edition), seed = 7)
            val modest = MintCeremonyParticles.build(GameMintCeremony.plan(edition, MintCeremonyMode.Normal, modest = true), seed = 7)
            assertThat(full.weave.size + full.dust.size).isAtMost(GameMintCeremony.PARTICLE_BUDGET)
            assertThat(full.weave.size).isAtLeast(2600)
            assertThat(modest.weave.size).isEqualTo(full.weave.size / 2)
        }
    }

    @Test
    fun a_refusal_brings_every_spark_back_to_the_light() {
        val refused = plan(MeeshEdition.Silver, MintCeremonyMode.Refused, answeredAtMs = 2600.0)
        val particles = MintCeremonyParticles.build(refused, seed = 92)
        assertThat(particles.paint(refused, 2.4).painted).isGreaterThan(2000)
        val rewound = refused.sceneTime(refused.refusal!!.rewind.toMs / 1000.0 + 0.1)
        assertThat(rewound).isLessThan(refused.span(MintCeremonyPhase.Emit)!!.fromMs / 1000.0)
        assertThat(particles.paint(refused, 6.0).painted).isEqualTo(0)
        assertThat(refused.strikes).isEmpty()
        assertThat(MintCeremonyChoreography.frame(refused, 3.0).shadow.opacity).isGreaterThan(0.5)
    }

    @Test
    fun a_frame_paints_its_thousands_of_particles_in_a_few_strokes() {
        val prism = plan(MeeshEdition.Prism)
        val particles = MintCeremonyParticles.build(prism, seed = 1000)
        val frame = particles.paint(prism, 2.7)
        assertThat(frame.painted).isGreaterThan(3000)
        assertThat(frame.batches.size).isLessThan(300)
        assertThat(particles.paint(prism, 2.7, stride = 2).painted.toDouble()).isWithin(60.0).of(((frame.painted + 1) / 2).toDouble())
    }

    @Test
    fun under_reduced_motion_the_scene_is_its_final_state_without_shake_nor_particles() {
        val reduced = GameMintCeremony.plan(MeeshEdition.Gold, MintCeremonyMode.Reduced)
        val revealed = MintCeremonyChoreography.frame(reduced, 0.4)
        assertThat(revealed.shake).isEqualTo(StagePoint.ZERO)
        assertThat(revealed.coin.engraved).isEqualTo(1.0)
        assertWithMessage("la pièce posée, revers montré").that(revealed.coin.rotateY).isEqualTo(180.0)
        assertThat(revealed.coin.opacity).isWithin(1e-9).of(1.0)
        assertThat(revealed.ring.opacity).isEqualTo(0.0)
        assertThat(revealed.flash).isEqualTo(0.0)
        assertThat(revealed.hammerMeo.opacity).isEqualTo(0.0)
    }
}
