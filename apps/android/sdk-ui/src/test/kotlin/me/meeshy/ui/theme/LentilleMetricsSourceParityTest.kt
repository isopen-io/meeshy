package me.meeshy.ui.theme

import com.google.common.truth.Truth.assertThat
import com.google.common.truth.Truth.assertWithMessage
import java.io.File
import org.junit.Test

/**
 * Garde de parité : relit `LentilleMetrics.swift` (la source iOS des cotes de la Lentille) et exige
 * que chaque constante numérique littérale y trouve son jumeau Kotlin de même valeur. Ajouter une
 * cote côté iOS sans la porter fait rougir ce test ; ne jamais corriger en recopiant à la main une
 * valeur dérivée.
 */
class LentilleMetricsSourceParityTest {

    private val enumHeader = Regex("""enum\s+(\w+)\s*\{""")
    private val constant = Regex("""static\s+let\s+(\w+)\s*:\s*(?:CGFloat|Double|Int)\s*=\s*(-?\d+(?:\.\d+)?)\s*$""")

    private fun source(): String {
        val relative = "apps/ios/Meeshy/Features/Main/Lentille/Core/LentilleMetrics.swift"
        var dir: File? = File("").absoluteFile
        while (dir != null) {
            val candidate = File(dir, relative)
            if (candidate.isFile) return candidate.readText()
            dir = dir.parentFile
        }
        error("LentilleMetrics.swift introuvable en remontant depuis ${File("").absolutePath} (cherché: $relative)")
    }

    private fun swiftLiterals(): Map<String, Double> {
        var current: String? = null
        val out = linkedMapOf<String, Double>()
        source().lines().forEach { raw ->
            val line = raw.trim()
            if (line.startsWith("//")) return@forEach
            enumHeader.find(line)?.let { current = it.groupValues[1] }
            val owner = current ?: return@forEach
            constant.find(line)?.let { out["$owner.${it.groupValues[1]}"] = it.groupValues[2].toDouble() }
        }
        return out
    }

    private fun Float.d(): Double = toString().toDouble()

    private val kotlin: Map<String, Double> = run {
        mapOf(
            "Row.height" to LentilleMetrics.Row.height.value.d(),
            "Row.maxScale" to LentilleMetrics.Row.maxScale.d(),
            "Row.paddingVertical" to LentilleMetrics.Row.paddingVertical.value.d(),
            "Row.paddingHorizontal" to LentilleMetrics.Row.paddingHorizontal.value.d(),
            "Row.marginHorizontal" to LentilleMetrics.Row.marginHorizontal.value.d(),
            "Row.marginVertical" to LentilleMetrics.Row.marginVertical.value.d(),
            "Row.radius" to LentilleMetrics.Row.radius.value.d(),
            "Row.transformOriginX" to LentilleMetrics.Row.transformOriginX.d(),
            "Row.transformOriginY" to LentilleMetrics.Row.transformOriginY.d(),
            "Avatar.ringWidth" to LentilleMetrics.Avatar.ringWidth.value.d(),
            "Avatar.ringOpacity" to LentilleMetrics.Avatar.ringOpacity.d(),
            "PresenceDot.size" to LentilleMetrics.PresenceDot.size.value.d(),
            "PresenceDot.borderSize" to LentilleMetrics.PresenceDot.borderSize.value.d(),
            "Time.size" to LentilleMetrics.Time.size.value.d(),
            "UnreadDot.size" to LentilleMetrics.UnreadDot.size.value.d(),
            "FocusCard.ringSize" to LentilleMetrics.FocusCard.ringSize.value.d(),
            "FocusCard.radius" to LentilleMetrics.FocusCard.radius.value.d(),
            "FocusCard.height" to LentilleMetrics.FocusCard.height.value.d(),
            "FocusCard.paddingVertical" to LentilleMetrics.FocusCard.paddingVertical.value.d(),
            "FocusCard.nameSize" to LentilleMetrics.FocusCard.nameSize.value.d(),
            "FocusCard.breathingRampStart" to LentilleMetrics.FocusCard.breathingRampStart.value.d(),
            "FocusCard.breathingRampLength" to LentilleMetrics.FocusCard.breathingRampLength.value.d(),
            "FocusCard.loupeGain" to LentilleMetrics.FocusCard.loupeGain.d(),
            "ModeNotch.size" to LentilleMetrics.ModeNotch.size.value.d(),
            "ModeNotch.top" to LentilleMetrics.ModeNotch.top.value.d(),
            "ModeNotch.right" to LentilleMetrics.ModeNotch.right.value.d(),
            "Sticker.size" to LentilleMetrics.Sticker.size.value.d(),
            "Sticker.letterSpacingEm" to LentilleMetrics.Sticker.letterSpacingEm.d(),
            "Sticker.paddingVertical" to LentilleMetrics.Sticker.paddingVertical.value.d(),
            "Sticker.paddingHorizontal" to LentilleMetrics.Sticker.paddingHorizontal.value.d(),
            "Pill.top" to LentilleMetrics.Pill.top.value.d(),
            "Pill.fadeDurationMs" to LentilleMetrics.Pill.fadeDurationMs.toDouble(),
            "Rail.size" to LentilleMetrics.Rail.size.value.d(),
            "Rail.ringWidth" to LentilleMetrics.Rail.ringWidth.value.d(),
            "Rail.paddingVertical" to LentilleMetrics.Rail.paddingVertical.value.d(),
            "Rail.maxEntries" to LentilleMetrics.Rail.maxEntries.toDouble(),
            "Tags.size" to LentilleMetrics.Tags.size.value.d(),
            "Tags.maxCount" to LentilleMetrics.Tags.maxCount.toDouble(),
            "Tags.emojiSize" to LentilleMetrics.Tags.emojiSize.value.d(),
            "Tags.chipFontSize" to LentilleMetrics.Tags.chipFontSize.value.d(),
            "Tags.bubbleFillOpacity" to LentilleMetrics.Tags.bubbleFillOpacity.d(),
            "Tags.chipPaddingHorizontal" to LentilleMetrics.Tags.chipPaddingHorizontal.value.d(),
            "Tags.chipPaddingVertical" to LentilleMetrics.Tags.chipPaddingVertical.value.d(),
            "Muted.opacity" to LentilleMetrics.Muted.opacity.d(),
            "Agent.avatarRingWidth" to LentilleMetrics.Agent.avatarRingWidth.value.d(),
        )
    }

    @Test
    fun `every numeric literal of the iOS metrics has an identical Kotlin twin`() {
        assertThat(kotlin).containsExactlyEntriesIn(swiftLiterals())
    }

    @Test
    fun `the iOS source still exposes the metrics this guard reads`() {
        assertWithMessage("le parseur ne lit rien : le format du fichier iOS a changé")
            .that(swiftLiterals().keys).containsAtLeast("Row.height", "FocusCard.height", "Rail.size")
    }

    @Test
    fun `derived iOS metrics are mirrored by their derivation`() {
        assertThat(LentilleMetrics.FocusCard.breathing).isEqualTo(LentilleMetrics.Row.marginVertical)
        assertThat(LentilleMetrics.FocusInline.height)
            .isEqualTo(LentilleMetrics.Row.height + LentilleMetrics.Row.marginVertical * 2)
        assertThat(LentilleMetrics.FocusInline.paddingVertical).isEqualTo(LentilleMetrics.Row.paddingVertical)
    }
}
