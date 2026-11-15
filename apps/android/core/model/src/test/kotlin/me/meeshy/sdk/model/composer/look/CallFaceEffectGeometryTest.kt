package me.meeshy.sdk.model.composer.look

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.imageedit.NormalizedCrop
import org.junit.Test

/** La géométrie des effets de visage — miroir de `CallFaceEffectGeometryTests` (iOS), y vers le BAS (#12733). */
class CallFaceEffectGeometryTest {

    private val face = FaceBox(100f, 200f, 200f, 260f)

    @Test
    fun `le halo flotte au-dessus de la tete, plus large que haut`() {
        val halo = CallFaceEffectGeometry.haloRect(face)
        assertThat(halo.midY).isLessThan(face.top)
        assertThat(halo.midX).isWithin(0.001f).of(face.midX)
        assertThat(halo.width).isGreaterThan(halo.height)
        assertThat(halo.width).isAtLeast(face.width)
    }

    @Test
    fun `deux cornes symetriques sortent du front`() {
        val horns = CallFaceEffectGeometry.hornRects(face)
        assertThat(horns).hasSize(2)
        assertThat(horns[0].midX).isLessThan(face.midX)
        assertThat(horns[1].midX).isGreaterThan(face.midX)
        assertThat(face.midX - horns[0].midX).isWithin(0.001f).of(horns[1].midX - face.midX)
        assertThat(horns[0].bottom).isGreaterThan(face.top)
        assertThat(horns[0].top).isLessThan(face.top)
        assertThat(horns.all { it.left >= face.left && it.right <= face.right }).isTrue()
    }

    @Test
    fun `les yeux detectes se rangent de gauche a droite, absents ils s estiment dans le haut du visage`() {
        val detected = CallFaceLandmarks(face, leftEye = FacePoint(250f, 300f), rightEye = FacePoint(150f, 300f))
        assertThat(CallFaceEffectGeometry.eyeCenters(detected)).containsExactly(FacePoint(150f, 300f), FacePoint(250f, 300f)).inOrder()
        val estimated = CallFaceEffectGeometry.eyeCenters(CallFaceLandmarks(face))
        assertThat(estimated.all { face.contains(it) && it.y < face.midY }).isTrue()
        assertThat(estimated[0].x).isLessThan(estimated[1].x)
    }

    @Test
    fun `les joues sont sous les yeux, de part et d autre`() {
        val cheeks = CallFaceEffectGeometry.cheekCenters(face)
        val eyes = CallFaceEffectGeometry.eyeCenters(CallFaceLandmarks(face))
        assertThat(cheeks.all { face.contains(it) && it.y > eyes[0].y }).isTrue()
        assertThat(cheeks[0].x).isLessThan(face.midX)
        assertThat(cheeks[1].x).isGreaterThan(face.midX)
    }

    @Test
    fun `les verrues sont deterministes et dans le visage`() {
        val first = CallFaceEffectGeometry.wartCenters(face, 6, 42uL)
        assertThat(first).isEqualTo(CallFaceEffectGeometry.wartCenters(face, 6, 42uL))
        assertThat(first).hasSize(6)
        assertThat(first.all { face.contains(it) }).isTrue()
        assertThat(first).isNotEqualTo(CallFaceEffectGeometry.wartCenters(face, 6, 7uL))
        assertThat(CallFaceEffectGeometry.wartCenters(face, -2, 1uL)).isEmpty()
    }

    @Test
    fun `les braises restent sur la toile et montent avec le temps`() {
        val before = CallFaceEffectGeometry.embers(28, 2.0, 720f, 1280f, 5uL)
        val after = CallFaceEffectGeometry.embers(28, 2.05, 720f, 1280f, 5uL)
        assertThat(zip(before, after).count { (b, a) -> a.center.y < b.center.y }).isGreaterThan(20)
        assertThat(before.all { it.opacity in 0f..1f && it.radius > 0f && it.center.y in 0f..1280f }).isTrue()
        assertThat(CallFaceEffectGeometry.lavaHeight(0.0, 1000f)).isWithin(0.001f).of(160f)
    }

    @Test
    fun `l unite pseudo aleatoire reste dans l intervalle semi ouvert`() {
        assertThat((0 until 500).map { CallFaceEffectGeometry.unit(99uL, it, 4uL) }.all { it >= 0f && it < 1f }).isTrue()
    }

    @Test
    fun `un visage lu par ses yeux se place autour d eux, et suit le recadrage de la prise`() {
        val landmarks = CallFaceLandmarks.fromEyes(FacePoint(0.5f, 0.4f), eyesDistance = 0.18f)
        assertThat(landmarks.bounds.width).isWithin(0.001f).of(0.5f)
        assertThat(landmarks.leftEye!!.x).isWithin(0.001f).of(0.41f)
        assertThat(CallFaceEffectGeometry.eyeCenters(CallFaceLandmarks(landmarks.bounds)).first().y).isWithin(0.001f).of(0.4f)
        val placed = landmarks.placed(NormalizedCrop(0.25f, 0f, 0.5f, 1f), 100f, 200f)
        assertThat(placed.leftEye!!.x).isWithin(0.01f).of(32f)
        assertThat(placed.leftEye!!.y).isWithin(0.01f).of(80f)
    }

    private fun <A, B> zip(a: List<A>, b: List<B>) = a.zip(b)
}
