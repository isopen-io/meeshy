package me.meeshy.sdk.model.appearance

import com.google.common.truth.Truth.assertThat
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import me.meeshy.sdk.model.appearance.AppearanceFixtures.array
import me.meeshy.sdk.model.appearance.AppearanceFixtures.json
import me.meeshy.sdk.model.appearance.AppearanceFixtures.motionJson
import me.meeshy.sdk.model.appearance.AppearanceFixtures.number
import me.meeshy.sdk.model.appearance.AppearanceFixtures.parse
import me.meeshy.sdk.model.appearance.AppearanceFixtures.text
import me.meeshy.sdk.model.appearance.AppearanceFixtures.with
import org.junit.Assert.assertThrows
import org.junit.Test

/**
 * Une animation est une DONNÉE bornée : hors bornes, le mouvement est ignoré — jamais le cadre qui
 * le porte. Les mêmes bornes que `frame-decor.ts` (le TypeScript a raison).
 */
class FrameDecorBoundsTest {

    private fun motion(
        kind: FrameMotionKind = FrameMotionKind.ROTATE,
        targets: List<String> = listOf("etoile"),
        duration: Double = 12.0,
        delay: Double? = null,
        stagger: Double? = null,
        amplitude: Double? = null,
        origin: FrameMotionOrigin? = null,
    ) = FrameMotion(kind, targets, duration, delay = delay, stagger = stagger, amplitude = amplitude, origin = origin)

    private fun refuses(build: () -> Any) {
        assertThrows(IllegalArgumentException::class.java) { build() }
    }

    private fun readMotions(items: JsonElement): List<FrameMotion> =
        json.decodeFromString(MotionHolder.serializer(), parse("""{"motion":[]}""").with("motion" to items).toString()).motion

    @kotlinx.serialization.Serializable
    private class MotionHolder(
        @kotlinx.serialization.Serializable(with = FrameMotionListSerializer::class)
        val motion: List<FrameMotion> = emptyList(),
    )

    // --- Durée, délai, décalage ---------------------------------------------------------

    @Test
    fun `a duration between half a second and three minutes is accepted`() {
        assertThat(motion(duration = 0.5).duration).isEqualTo(0.5)
        assertThat(motion(duration = 180.0).duration).isEqualTo(180.0)
    }

    @Test
    fun `a duration outside half a second to three minutes is refused`() {
        refuses { motion(duration = 0.49) }
        refuses { motion(duration = 180.1) }
        refuses { motion(duration = 0.0) }
        refuses { motion(duration = -3.0) }
    }

    @Test
    fun `a delay is between zero and thirty seconds and a stagger between zero and ten`() {
        motion(delay = 0.0, stagger = 0.0)
        motion(delay = 30.0, stagger = 10.0)
        refuses { motion(delay = 30.1) }
        refuses { motion(delay = -0.1) }
        refuses { motion(stagger = 10.1) }
        refuses { motion(stagger = -1.0) }
    }

    // --- Cibles ------------------------------------------------------------------------

    @Test
    fun `a motion names between one and sixteen distinct group targets`() {
        motion(targets = List(16) { "cible-$it" })
        refuses { motion(targets = emptyList()) }
        refuses { motion(targets = List(17) { "cible-$it" }) }
        refuses { motion(targets = listOf("etoile", "etoile")) }
    }

    @Test
    fun `a target must be a slug of at most twenty four characters`() {
        motion(targets = listOf("a"))
        motion(targets = listOf("a".repeat(24)))
        refuses { motion(targets = listOf("a".repeat(25))) }
        refuses { motion(targets = listOf("Etoile")) }
        refuses { motion(targets = listOf("-etoile")) }
        refuses { motion(targets = listOf("etoile-")) }
        refuses { motion(targets = listOf("deux mots")) }
    }

    // --- Amplitude et point d'ancrage dépendent du mouvement ------------------------------

    @Test
    fun `the amplitude range depends on the motion`() {
        motion(FrameMotionKind.ROTATE, amplitude = 1.0)
        motion(FrameMotionKind.ROTATE, amplitude = 360.0)
        motion(FrameMotionKind.PULSE, amplitude = 0.01)
        motion(FrameMotionKind.PULSE, amplitude = 0.3)
        motion(FrameMotionKind.TWINKLE, amplitude = 0.05)
        motion(FrameMotionKind.TWINKLE, amplitude = 1.0)
        motion(FrameMotionKind.SKEW, amplitude = 1.0, origin = FrameMotionOrigin.TOP)
        motion(FrameMotionKind.SKEW, amplitude = 15.0, origin = FrameMotionOrigin.TOP)
        refuses { motion(FrameMotionKind.ROTATE, amplitude = 361.0) }
        refuses { motion(FrameMotionKind.PULSE, amplitude = 0.31) }
        refuses { motion(FrameMotionKind.TWINKLE, amplitude = 0.04) }
        refuses { motion(FrameMotionKind.SKEW, amplitude = 16.0) }
    }

    @Test
    fun `a sweep takes no amplitude at all`() {
        motion(FrameMotionKind.SWEEP)
        refuses { motion(FrameMotionKind.SWEEP, amplitude = 1.0) }
        assertThat(FrameMotionKind.SWEEP.amplitudeRange).isNull()
    }

    @Test
    fun `the origins a motion accepts depend on the motion`() {
        FrameMotionOrigin.entries.forEach { motion(FrameMotionKind.ROTATE, origin = it) }
        motion(FrameMotionKind.PULSE, origin = FrameMotionOrigin.FRAME)
        motion(FrameMotionKind.PULSE, origin = FrameMotionOrigin.SELF)
        refuses { motion(FrameMotionKind.PULSE, origin = FrameMotionOrigin.TOP) }
        refuses { motion(FrameMotionKind.SKEW, origin = FrameMotionOrigin.FRAME) }
        refuses { motion(FrameMotionKind.SWEEP, origin = FrameMotionOrigin.SELF) }
        refuses { motion(FrameMotionKind.TWINKLE, origin = FrameMotionOrigin.SELF) }
    }

    // --- La liste est tolérante --------------------------------------------------------

    @Test
    fun `an unknown or out of bounds motion is dropped and the others stay in order`() {
        val tooLong = motionJson("pulse").with("duration" to number(500))
        val unknown = motionJson("explode")

        val kept = readMotions(array(motionJson("rotate"), unknown, tooLong, motionJson("sweep")))

        assertThat(kept.map { it.kind }).containsExactly(FrameMotionKind.ROTATE, FrameMotionKind.SWEEP).inOrder()
    }

    @Test
    fun `a motion that is not an object is dropped`() {
        assertThat(readMotions(array(text("rotate"), motionJson("twinkle"))).map { it.kind })
            .containsExactly(FrameMotionKind.TWINKLE)
    }

    @Test
    fun `at most eight motions are kept`() {
        val kept = readMotions(JsonArray(List(12) { motionJson("rotate", "cible-$it") }))

        assertThat(kept).hasSize(8)
        assertThat(kept.first().targets).containsExactly("cible-0")
    }

    @Test
    fun `a list of more than thirty two motions is an abuse and nothing animates`() {
        assertThat(readMotions(JsonArray(List(33) { motionJson("rotate", "cible-$it") }))).isEmpty()
        assertThat(readMotions(JsonArray(List(32) { motionJson("rotate", "cible-$it") }))).hasSize(8)
    }

    @Test
    fun `a motion list that is not a list is read empty`() {
        assertThat(readMotions(text("rotate"))).isEmpty()
    }

    @Test
    fun `the motion vocabulary is closed on the five motions of the contract`() {
        assertThat(FrameMotionKind.entries.map { it.name }).containsExactly("ROTATE", "PULSE", "SWEEP", "TWINKLE", "SKEW")
    }

    // --- Dégradés ------------------------------------------------------------------------

    private fun gradient(
        kind: String = "linear",
        x1: Double = 0.0,
        y1: Double = 0.0,
        x2: Double = 1.0,
        y2: Double = 0.0,
        stops: List<FrameGradientStop> = listOf(FrameGradientStop(0, 0.0), FrameGradientStop(1, 1.0)),
    ) = FrameGradient(kind, x1, y1, x2, y2, stops)

    @Test
    fun `a linear gradient with two to four ordered stops inside the unit box is accepted`() {
        gradient()
        gradient(stops = List(4) { FrameGradientStop(it, it * 0.25) })
        gradient(stops = listOf(FrameGradientStop(0, 0.5), FrameGradientStop(1, 0.5, opacity = 0.2)))
    }

    @Test
    fun `any other gradient is refused`() {
        refuses { gradient(kind = "radial") }
        refuses { gradient(x1 = -0.1) }
        refuses { gradient(y2 = 1.1) }
        refuses { gradient(stops = listOf(FrameGradientStop(0, 0.0))) }
        refuses { gradient(stops = List(5) { FrameGradientStop(it, it * 0.2) }) }
        refuses { gradient(stops = listOf(FrameGradientStop(0, 0.8), FrameGradientStop(1, 0.2))) }
        refuses { gradient(stops = listOf(FrameGradientStop(0, 0.0), FrameGradientStop(1, 1.2))) }
        refuses { gradient(stops = listOf(FrameGradientStop(0, 0.0, opacity = 2.0), FrameGradientStop(1, 1.0))) }
        refuses { gradient(stops = listOf(FrameGradientStop(-1, 0.0), FrameGradientStop(1, 1.0))) }
    }

    @Test
    fun `a gradient fits a palette only if every stop names one of its colours`() {
        val gradient = gradient(stops = listOf(FrameGradientStop(0, 0.0), FrameGradientStop(2, 1.0)))

        assertThat(gradient.fitsPalette(3)).isTrue()
        assertThat(gradient.fitsPalette(2)).isFalse()
    }

    // --- Les contrôles de champ -------------------------------------------------------------

    @Test
    fun `path data is made of SVG commands only`() {
        assertThat(FrameDecorField.isPathData("M0 0 L10,10 Q 5 5 1e-3 2.5 Z", 100)).isTrue()
        assertThat(FrameDecorField.isPathData("M.6 17H9M.6 28H9", 100)).isTrue()
        assertThat(FrameDecorField.isPathData("", 100)).isFalse()
        assertThat(FrameDecorField.isPathData("M0 0 <svg/>", 100)).isFalse()
        assertThat(FrameDecorField.isPathData("M0 0 \"onload=", 100)).isFalse()
        assertThat(FrameDecorField.isPathData("M0 0 L10 10", 5)).isFalse()
    }

    @Test
    fun `a group is a short slug`() {
        assertThat(FrameDecorField.isGroup("etoile-1")).isTrue()
        assertThat(FrameDecorField.isGroup("Etoile")).isFalse()
        assertThat(FrameDecorField.isGroup("")).isFalse()
        assertThat(FrameDecorField.isGroup("a".repeat(25))).isFalse()
    }
}
