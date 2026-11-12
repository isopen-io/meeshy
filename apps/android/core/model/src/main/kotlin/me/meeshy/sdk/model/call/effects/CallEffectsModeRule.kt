package me.meeshy.sdk.model.call.effects

import me.meeshy.sdk.model.call.CallFaceEffect
import me.meeshy.sdk.model.call.VideoFilterConfig
import me.meeshy.sdk.model.call.VideoFilterPreset
import me.meeshy.sdk.model.call.activeFaceEffect
import me.meeshy.sdk.model.call.activePreset
import me.meeshy.sdk.model.call.applyingPreset
import me.meeshy.sdk.model.call.selectingFaceEffect
import me.meeshy.sdk.model.call.withBackgroundBlur
import me.meeshy.sdk.model.call.withBrightness
import me.meeshy.sdk.model.call.withSmoothingIntensity

/** The two rows of the « Effets » mode, in iOS order: the face, then the colour. iOS `CallEffectsCategory`. */
enum class CallEffectsCategory { Face, Color }

/**
 * **LE MODE « EFFETS » DE L'APPEL** — miroir de iOS `CallEffectsModeRule` (`CallModeRules.swift`). The
 * catalogue keeps iOS order (the eight moods of [VideoFilterPreset.catalog]), and every face effect of iOS is drawn
 * on the sent image (#13706).
 */
object CallEffectsModeRule {
    val colors: List<VideoFilterPreset> = VideoFilterPreset.catalog

    /** The face effects, in iOS order (iOS `faces = CallFaceEffect.allCases`). */
    val faces: List<CallFaceEffect> = CallFaceEffect.entries

    fun colorSelection(config: VideoFilterConfig): VideoFilterPreset = config.activePreset ?: VideoFilterPreset.Natural

    /** Natural is « no look »: picking it turns the colorimetry off instead of grading with an identity. */
    fun applying(color: VideoFilterPreset, to: VideoFilterConfig): VideoFilterConfig =
        to.applyingPreset(if (color == VideoFilterPreset.Natural) null else color)

    /** P8b law 14 — « (+) Ajouter un autre look » opens the other kind, to stack on the look in hand (face and colour accumulate). iOS `addingLook`. */
    fun addingLook(from: CallEffectsCategory): CallEffectsCategory = when (from) {
        CallEffectsCategory.Face -> CallEffectsCategory.Color
        CallEffectsCategory.Color -> CallEffectsCategory.Face
    }

    /** The carousel step of TalkBack's « next / previous »: bounded, never wrapping (iOS `stepping`). */
    fun <T> stepping(selection: T, items: List<T>, by: Int): T {
        val index = items.indexOf(selection)
        if (index < 0) return items.firstOrNull() ?: selection
        return items[(index + by).coerceIn(0, items.lastIndex)]
    }
}

/**
 * P8b.6 — with Settings open, the looks strip and the chips fade out while the panel rises from the tightened bar
 * (≈ 200 ms, transform + opacity), and back down on the way out. Reduce Motion keeps a short fade, no rise: the screen
 * never changes at once. iOS `CallEffectsSettingsMotion`.
 */
object CallEffectsSettingsMotion {
    private const val RISE_DP = 20
    private const val DURATION_MILLIS = 200
    private const val REDUCED_DURATION_MILLIS = 150

    fun durationMillis(reduceMotion: Boolean): Int = if (reduceMotion) REDUCED_DURATION_MILLIS else DURATION_MILLIS
    fun riseDp(reduceMotion: Boolean): Int = if (reduceMotion) 0 else RISE_DP
}

/**
 * What the « Effets » mode holds while it is open: the config being tried ([current]), applied live to the sent
 * camera and kept as it is when the mode closes (no Quit, no Validate: law 14). Pure reducer.
 */
data class CallEffectsModeState(
    val current: VideoFilterConfig,
    val category: CallEffectsCategory = CallEffectsCategory.Face,
    val showsSettings: Boolean = false,
) {
    val face: CallFaceEffect get() = current.activeFaceEffect
    val color: VideoFilterPreset get() = CallEffectsModeRule.colorSelection(current)
    val showsSmoothingStrength: Boolean get() = face == CallFaceEffect.Smoothing

    fun selecting(effect: CallFaceEffect): CallEffectsModeState = copy(current = current.selectingFaceEffect(effect))
    fun selecting(preset: VideoFilterPreset): CallEffectsModeState = copy(current = CallEffectsModeRule.applying(preset, current))
    fun showing(category: CallEffectsCategory): CallEffectsModeState = copy(category = category)
    fun togglingSettings(): CallEffectsModeState = copy(showsSettings = !showsSettings)
    fun withBrightness(value: Float): CallEffectsModeState = copy(current = current.withBrightness(value))
    fun withSmoothing(value: Float): CallEffectsModeState = copy(current = current.withSmoothingIntensity(value))
    fun togglingBlur(): CallEffectsModeState = copy(current = current.withBackgroundBlur(!current.backgroundBlurEnabled))

    /** (+): the other kind of look, the settings closed. */
    fun addingLook(): CallEffectsModeState = copy(category = CallEffectsModeRule.addingLook(category), showsSettings = false)

    companion object {
        fun opening(config: VideoFilterConfig): CallEffectsModeState = CallEffectsModeState(current = config)
    }
}
