package me.meeshy.ui.theme

import androidx.compose.animation.core.SpringSpec
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.TextUnit
import com.google.common.truth.Truth.assertThat
import java.io.File
import org.junit.Test

/**
 * Les échelles de jetons d'Android sont LES MÊMES que celles d'iOS : ce test lit
 * `DesignTokens.swift` (la source de vérité) et exige, enum par enum, que chaque
 * jeton y trouve son jumeau Kotlin de même valeur. Ajouter un jeton côté iOS sans
 * le porter ici fait rougir le test ; ne jamais « corriger » en recopiant une
 * valeur dérivée — porter le jeton.
 */
class MeeshyScalesParityTest {

    private val swift: Map<String, Map<String, Double>> by lazy { SwiftTokens.parse(designTokensSource()) }
    private val swiftShadows: Map<String, Triple<Double, Double, Double>> by lazy {
        SwiftTokens.parseShadows(designTokensSource())
    }
    private val swiftSprings: Map<String, Pair<Double, Double>> by lazy {
        SwiftTokens.parseSprings(designTokensSource())
    }

    private fun designTokensSource(): String {
        val relative = "packages/MeeshySDK/Sources/MeeshyUI/Theme/DesignTokens.swift"
        var dir: File? = File("").absoluteFile
        while (dir != null) {
            val candidate = File(dir, relative)
            if (candidate.isFile) return candidate.readText()
            dir = dir.parentFile
        }
        error("DesignTokens.swift introuvable en remontant depuis ${File("").absolutePath} (cherché: $relative)")
    }

    private fun dp(vararg tokens: Pair<String, Dp>): Map<String, Double> =
        tokens.associate { (name, value) -> name to value.value.toDouble() }

    private fun fraction(vararg tokens: Pair<String, Float>): Map<String, Double> =
        tokens.associate { (name, value) -> name to value.toString().toDouble() }

    private fun sp(vararg tokens: Pair<String, TextUnit>): Map<String, Double> =
        tokens.associate { (name, value) -> name to value.value.toDouble() }

    private fun assertSameTokens(swiftEnum: String, kotlin: Map<String, Double>) {
        val expected = swift.getValue(swiftEnum)
        assertThat(kotlin).containsExactlyEntriesIn(expected)
    }

    @Test
    fun `spacing matches iOS MeeshySpacing`() = assertSameTokens(
        "MeeshySpacing",
        dp(
            "xxs" to MeeshySpacing.xxs, "xs" to MeeshySpacing.xs, "xsPlus" to MeeshySpacing.xsPlus,
            "sm" to MeeshySpacing.sm, "smPlus" to MeeshySpacing.smPlus, "md" to MeeshySpacing.md,
            "mdPlus" to MeeshySpacing.mdPlus, "lg" to MeeshySpacing.lg, "xl" to MeeshySpacing.xl,
            "xxl" to MeeshySpacing.xxl, "xxxl" to MeeshySpacing.xxxl,
        ),
    )

    @Test
    fun `radius matches iOS MeeshyRadius`() = assertSameTokens(
        "MeeshyRadius",
        dp(
            "xxs" to MeeshyRadius.xxs, "xs" to MeeshyRadius.xs, "sm" to MeeshyRadius.sm,
            "smPlus" to MeeshyRadius.smPlus, "md" to MeeshyRadius.md, "lg" to MeeshyRadius.lg,
            "lgPlus" to MeeshyRadius.lgPlus, "xl" to MeeshyRadius.xl, "xlPlus" to MeeshyRadius.xlPlus,
            "xxl" to MeeshyRadius.xxl,
        ),
    )

    @Test
    fun `font sizes match iOS MeeshyFont from 9 to 34`() = assertSameTokens(
        "MeeshyFont",
        sp(
            "microSize" to MeeshyFontSize.micro, "captionSize" to MeeshyFontSize.caption,
            "footnoteSize" to MeeshyFontSize.footnote, "smallSize" to MeeshyFontSize.small,
            "subheadSize" to MeeshyFontSize.subhead, "labelSize" to MeeshyFontSize.label,
            "bodySize" to MeeshyFontSize.body, "calloutSize" to MeeshyFontSize.callout,
            "headlineSize" to MeeshyFontSize.headline, "subtitleSize" to MeeshyFontSize.subtitle,
            "title3Size" to MeeshyFontSize.title3, "titleSize" to MeeshyFontSize.title,
            "displaySize" to MeeshyFontSize.display, "largeTitleSize" to MeeshyFontSize.largeTitle,
        ),
    )

    @Test
    fun `icon sizes match iOS MeeshyIconSize`() = assertSameTokens(
        "MeeshyIconSize",
        dp(
            "xxs" to MeeshyIconSize.xxs, "xs" to MeeshyIconSize.xs, "sm" to MeeshyIconSize.sm,
            "md" to MeeshyIconSize.md, "lg" to MeeshyIconSize.lg, "xl" to MeeshyIconSize.xl,
            "xxl" to MeeshyIconSize.xxl, "xxxl" to MeeshyIconSize.xxxl, "hero" to MeeshyIconSize.hero,
        ),
    )

    @Test
    fun `control sizes match iOS MeeshyControlSize`() = assertSameTokens(
        "MeeshyControlSize",
        dp(
            "small" to MeeshyControlSize.small, "compact" to MeeshyControlSize.compact,
            "regular" to MeeshyControlSize.regular, "large" to MeeshyControlSize.large,
            "tapTarget" to MeeshyControlSize.tapTarget, "buttonHeight" to MeeshyControlSize.buttonHeight,
        ),
    )

    @Test
    fun `border widths match iOS MeeshyBorder`() = assertSameTokens(
        "MeeshyBorder",
        dp(
            "hairline" to MeeshyBorder.hairline, "regular" to MeeshyBorder.regular,
            "emphasis" to MeeshyBorder.emphasis, "strong" to MeeshyBorder.strong,
        ),
    )

    @Test
    fun `opacities match iOS MeeshyOpacity`() = assertSameTokens(
        "MeeshyOpacity",
        fraction(
            "faint" to MeeshyOpacity.faint, "subtle" to MeeshyOpacity.subtle, "light" to MeeshyOpacity.light,
            "medium" to MeeshyOpacity.medium, "strong" to MeeshyOpacity.strong, "heavy" to MeeshyOpacity.heavy,
            "intense" to MeeshyOpacity.intense,
        ),
    )

    @Test
    fun `shadows match iOS MeeshyShadow`() {
        val kotlin = mapOf(
            "subtle" to MeeshyShadow.subtle, "medium" to MeeshyShadow.medium, "strong" to MeeshyShadow.strong,
        ).mapValues { (_, spec) ->
            Triple(spec.opacity.toString().toDouble(), spec.radius.value.toDouble(), spec.y.value.toDouble())
        }
        assertThat(kotlin).containsExactlyEntriesIn(swiftShadows)
    }

    @Test
    fun `layout widths match iOS MeeshyLayout`() = assertSameTokens(
        "MeeshyLayout",
        dp("formMaxWidth" to MeeshyLayout.formMaxWidth, "contentMaxWidth" to MeeshyLayout.contentMaxWidth),
    )

    @Test
    fun `springs convert the iOS response and damping fraction`() {
        val kotlin: Map<String, SpringSpec<Float>> = mapOf(
            "springFast" to MeeshyMotion.springFast<Float>(),
            "springDefault" to MeeshyMotion.springDefault<Float>(),
            "springBouncy" to MeeshyMotion.springBouncy<Float>(),
        )
        assertThat(kotlin.keys).containsExactlyElementsIn(swiftSprings.keys)
        kotlin.forEach { (name, spec) ->
            val (response, damping) = swiftSprings.getValue(name)
            assertThat(spec.dampingRatio.toDouble()).isWithin(1e-6).of(damping)
            assertThat(spec.stiffness).isWithin(0.01f).of(MeeshyMotion.stiffnessForResponse(response.toFloat()))
        }
    }

    @Test
    fun `stagger delay is the iOS staggerDelay in milliseconds`() {
        val staggerSeconds = swift.getValue("MeeshyAnimation").getValue("staggerDelay")
        assertThat(MeeshyMotion.STAGGER_STEP_MILLIS.toDouble()).isWithin(1e-6).of(staggerSeconds * 1000.0)
    }

    @Test
    fun `every Android scale is a strictly ascending list`() {
        assertThat(MeeshyFontSize.scale.map { it.value }).isInStrictOrder()
        assertThat(MeeshyIconSize.scale.map { it.value }).isInStrictOrder()
        assertThat(MeeshyControlSize.scale.map { it.value }).isInStrictOrder()
        assertThat(MeeshyBorder.scale.map { it.value }).isInStrictOrder()
        assertThat(MeeshyOpacity.scale).isInStrictOrder()
    }

    @Test
    fun `the Android touch floor stays at the Material 48dp above the iOS 44pt tap target`() {
        assertThat(MeeshyControlSize.minTouchTarget.value).isEqualTo(48f)
        assertThat(MeeshyControlSize.minTouchTarget.value).isAtLeast(MeeshyControlSize.tapTarget.value)
    }
}

/** Lecture minimale de `DesignTokens.swift` : une constante `static let` par jeton. */
private object SwiftTokens {
    private val enumHeader = Regex("""enum\s+(\w+)\s*\{""")
    private val scalar = Regex("""static let (\w+)\s*(?::\s*\w+)?\s*=\s*(-?[0-9]+(?:\.[0-9]+)?)\s*$""")
    private val shadow = Regex(
        """static let (\w+)\s*=\s*\(opacity:\s*([0-9.]+),\s*radius:\s*([0-9.]+),\s*y:\s*([0-9.]+)\)""",
    )
    private val spring = Regex(
        """static let (\w+)\s*=\s*Animation\.spring\(response:\s*([0-9.]+),\s*dampingFraction:\s*([0-9.]+)\)""",
    )

    fun parse(source: String): Map<String, Map<String, Double>> {
        val result = linkedMapOf<String, MutableMap<String, Double>>()
        var current: MutableMap<String, Double>? = null
        source.lineSequence().map { it.trim() }.forEach { line ->
            enumHeader.find(line)?.let { current = result.getOrPut(it.groupValues[1]) { linkedMapOf() } }
            scalar.find(line)?.let { current?.put(it.groupValues[1], it.groupValues[2].toDouble()) }
        }
        return result
    }

    fun parseShadows(source: String): Map<String, Triple<Double, Double, Double>> =
        shadow.findAll(source).associate {
            val (name, opacity, radius, y) = it.destructured
            name to Triple(opacity.toDouble(), radius.toDouble(), y.toDouble())
        }

    fun parseSprings(source: String): Map<String, Pair<Double, Double>> =
        spring.findAll(source).associate {
            val (name, response, damping) = it.destructured
            name to (response.toDouble() to damping.toDouble())
        }
}
