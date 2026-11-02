package me.meeshy.sdk.model.call.frames

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class CallFrameMotionPlanTest {
    private fun ornament(kind: CallFrameOrnamentKind, motion: CallFrameOrnamentMotion = CallFrameOrnamentMotion.LOOP) =
        CallFrameOrnament(kind, "#FFFFFF", CallFrameDensity.MID, CallFrameLayer.FRONT, motion)

    private fun look(ornaments: List<CallFrameOrnament>, scene: List<CallFrameSceneLayer> = emptyList()) =
        CallLiveFrameRule.frames().first().look.copy(ornaments = ornaments, scene = scene)

    @Test
    fun `chaque forme qui sait bouger a son mouvement, les autres restent fixes`() {
        assertThat(CallFrameMotionPlan.style(CallFrameOrnamentKind.SNOW)).isEqualTo(CallFrameMotionStyle.Fall(12.0))
        assertThat(CallFrameMotionPlan.style(CallFrameOrnamentKind.SPARKLES)).isEqualTo(CallFrameMotionStyle.Twinkle(2.4))
        assertThat(CallFrameMotionPlan.style(CallFrameOrnamentKind.REC)).isEqualTo(CallFrameMotionStyle.Blink)
        assertThat(CallFrameMotionPlan.style(CallFrameOrnamentKind.GRAIN)).isNull()
        assertThat(CallFrameMotionPlan.moves(ornament(CallFrameOrnamentKind.ROSES))).isFalse()
        assertThat(CallFrameMotionPlan.moves(ornament(CallFrameOrnamentKind.SNOW, CallFrameOrnamentMotion.STILL))).isFalse()
        assertThat(CallFrameMotionPlan.moves(ornament(CallFrameOrnamentKind.SNOW))).isTrue()
    }

    @Test
    fun `les pistes gardent le rang du cadre, s arretent a quatre, et l entree ne boucle pas`() {
        val ornaments = listOf(
            ornament(CallFrameOrnamentKind.GRAIN),
            ornament(CallFrameOrnamentKind.SNOW),
            ornament(CallFrameOrnamentKind.STARS, CallFrameOrnamentMotion.ON_APPEAR),
            ornament(CallFrameOrnamentKind.BOKEH),
            ornament(CallFrameOrnamentKind.CLOUDS),
            ornament(CallFrameOrnamentKind.BATS),
        )
        val tracks = CallFrameMotionPlan.tracks(look(ornaments))
        assertThat(tracks.map { it.rank }).containsExactly(1, 2, 3, 4).inOrder()
        assertThat(tracks[1].repeats).isFalse()
        assertThat(CallFrameMotionPlan.animatedRanks(look(ornaments))).containsExactly(1, 2, 3, 4)
    }

    @Test
    fun `un scintillement se peint en trois groupes, une derive en deux, une chute traverse la toile`() {
        assertThat(CallFrameMotionPlan.partitions(CallFrameMotionStyle.Twinkle(1.0))).isEqualTo(3)
        assertThat(CallFrameMotionPlan.partitions(CallFrameMotionStyle.Drift(0.1, 1.0))).isEqualTo(2)
        assertThat(CallFrameMotionPlan.partitions(CallFrameMotionStyle.Fall(1.0))).isEqualTo(1)
        assertThat(CallFrameMotionPlan.travels(CallFrameMotionStyle.Rise(1.0))).isTrue()
        assertThat(CallFrameMotionPlan.travels(CallFrameMotionStyle.Spin(1.0))).isFalse()
        assertThat(CallFrameOrnamentPartition(1, 3).includes(4)).isTrue()
        assertThat(CallFrameOrnamentPartition(1, 3).includes(5)).isFalse()
        assertThat(CallFrameOrnamentPartition(0, 1).includes(5)).isTrue()
    }

    @Test
    fun `les particules d une scene s animent apres les ornements, a la densite de leur quantite`() {
        val particles = CallFrameSceneLayer("neige", CallFrameSceneLayerKind.PARTICLES, CallFrameSceneDepth.BACK, null, CallFrameOrnamentKind.SNOW, "#EEEEEE", null, 120)
        val tracks = CallFrameMotionPlan.sceneTracks(look(emptyList(), listOf(particles)))
        assertThat(tracks).hasSize(1)
        assertThat(tracks.single().rank).isEqualTo(CallFrameMotionPlan.SCENE_RANK_OFFSET)
        assertThat(tracks.single().ornament.density).isEqualTo(CallFrameDensity.HIGH)
        assertThat(tracks.single().ornament.layer).isEqualTo(CallFrameLayer.BACK)
        assertThat(CallFrameMotionPlan.density(null)).isEqualTo(CallFrameDensity.MID)
        assertThat(CallFrameMotionPlan.density(40)).isEqualTo(CallFrameDensity.LOW)
    }
}
