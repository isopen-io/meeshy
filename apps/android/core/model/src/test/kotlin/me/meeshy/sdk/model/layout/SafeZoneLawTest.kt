package me.meeshy.sdk.model.layout

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/**
 * Zone sure de la fenetre : barres systeme UNION decoupe camera, bord par bord, clavier exclu ;
 * geometrie de decoupe (miroir de `IslandGeometry.swift`) : la banniere in-app nait au centre de la
 * decoupe du haut et se pose avec 12 dp d'air sous elle.
 */
class SafeZoneLawTest {

    @Test
    fun `each edge takes the larger of the system bar and the cutout`() {
        val insets = SafeZoneLaw.insets(
            systemBars = EdgeInsetsDp(left = 0f, top = 24f, right = 0f, bottom = 48f),
            cutout = EdgeInsetsDp(left = 0f, top = 32f, right = 0f, bottom = 0f),
        )
        assertThat(insets).isEqualTo(EdgeInsetsDp(left = 0f, top = 32f, right = 0f, bottom = 48f))
    }

    @Test
    fun `a landscape cutout protects the side it sits on`() {
        val insets = SafeZoneLaw.insets(
            systemBars = EdgeInsetsDp(top = 24f, bottom = 16f),
            cutout = EdgeInsetsDp(left = 36f),
        )
        assertThat(insets.left).isEqualTo(36f)
        assertThat(insets.right).isEqualTo(0f)
    }

    @Test
    fun `negative insets are treated as none`() {
        val insets = SafeZoneLaw.insets(EdgeInsetsDp(top = -3f), EdgeInsetsDp.Zero)
        assertThat(insets.top).isEqualTo(0f)
    }

    @Test
    fun `the safe rect is the window minus the insets`() {
        val rect = SafeZoneLaw.safeRect(
            windowWidthDp = 411f,
            windowHeightDp = 891f,
            insets = EdgeInsetsDp(left = 0f, top = 32f, right = 0f, bottom = 48f),
        )
        assertThat(rect).isEqualTo(RectDp(left = 0f, top = 32f, right = 411f, bottom = 843f))
        assertThat(rect.width).isEqualTo(411f)
        assertThat(rect.height).isEqualTo(811f)
    }

    @Test
    fun `insets larger than the window collapse to an empty rect instead of inverting`() {
        val rect = SafeZoneLaw.safeRect(
            windowWidthDp = 100f,
            windowHeightDp = 60f,
            insets = EdgeInsetsDp(left = 70f, top = 40f, right = 70f, bottom = 40f),
        )
        assertThat(rect.width).isAtLeast(0f)
        assertThat(rect.height).isAtLeast(0f)
        assertThat(rect.left).isAtMost(100f)
        assertThat(rect.top).isAtMost(60f)
    }

    @Test
    fun `an element centre is clamped inside the safe zone`() {
        val zone = RectDp(left = 0f, top = 32f, right = 411f, bottom = 843f)
        assertThat(SafeZoneLaw.clampCenterY(centerY = 0f, halfHeight = 28f, zone = zone)).isEqualTo(60f)
        assertThat(SafeZoneLaw.clampCenterY(centerY = 900f, halfHeight = 28f, zone = zone)).isEqualTo(815f)
        assertThat(SafeZoneLaw.clampCenterY(centerY = 400f, halfHeight = 28f, zone = zone)).isEqualTo(400f)
    }

    @Test
    fun `an element taller than the zone is pinned to its top`() {
        val zone = RectDp(left = 0f, top = 32f, right = 100f, bottom = 52f)
        assertThat(SafeZoneLaw.clampCenterY(centerY = 500f, halfHeight = 28f, zone = zone)).isEqualTo(60f)
    }

    @Test
    fun `the top cutout is the one touching the top edge nearest the centre`() {
        val punchHole = RectDp(left = 190f, top = 0f, right = 222f, bottom = 30f)
        val corner = RectDp(left = 0f, top = 0f, right = 20f, bottom = 20f)
        val bottomOne = RectDp(left = 190f, top = 860f, right = 222f, bottom = 891f)
        assertThat(SafeZoneLaw.topCutout(listOf(corner, bottomOne, punchHole), windowWidthDp = 411f))
            .isEqualTo(punchHole)
    }

    @Test
    fun `no cutout on the top edge means no top cutout`() {
        val side = RectDp(left = 0f, top = 180f, right = 30f, bottom = 220f)
        assertThat(SafeZoneLaw.topCutout(listOf(side), windowWidthDp = 891f)).isNull()
        assertThat(SafeZoneLaw.topCutout(emptyList(), windowWidthDp = 891f)).isNull()
    }

    @Test
    fun `the banner settles twelve dp under the cutout when that beats the minimum`() {
        val punchHole = RectDp(left = 190f, top = 0f, right = 222f, bottom = 40f)
        val top = SafeZoneLaw.bannerTop(
            cutouts = listOf(punchHole),
            windowWidthDp = 411f,
            safeTopDp = 36f,
            minimumDp = 4f,
        )
        assertThat(top).isEqualTo(52f)
    }

    @Test
    fun `the minimum below the safe top wins when the safe area already clears the cutout`() {
        val punchHole = RectDp(left = 190f, top = 8f, right = 222f, bottom = 30f)
        val top = SafeZoneLaw.bannerTop(
            cutouts = listOf(punchHole),
            windowWidthDp = 411f,
            safeTopDp = 36f,
            minimumDp = 8f,
        )
        assertThat(top).isEqualTo(44f)
    }

    @Test
    fun `without a top cutout the banner settles under the safe top`() {
        val top = SafeZoneLaw.bannerTop(cutouts = emptyList(), windowWidthDp = 411f, safeTopDp = 24f, minimumDp = 8f)
        assertThat(top).isEqualTo(32f)
    }

    @Test
    fun `the banner is born at the centre of the top cutout`() {
        val punchHole = RectDp(left = 190f, top = 10f, right = 222f, bottom = 42f)
        assertThat(SafeZoneLaw.bannerEmergence(listOf(punchHole), windowWidthDp = 411f, safeTopDp = 52f))
            .isEqualTo(PointDp(x = 206f, y = 26f))
    }

    @Test
    fun `without a top cutout the banner is born centred in the top inset`() {
        assertThat(SafeZoneLaw.bannerEmergence(emptyList(), windowWidthDp = 400f, safeTopDp = 24f))
            .isEqualTo(PointDp(x = 200f, y = 12f))
    }
}
