package me.meeshy.sdk.model.call

/**
 * The face effects of the call « Effets » mode, in the carousel order. Miroir de iOS
 * `CallFaceEffect` (`apps/ios/.../Call/Services/CallFaceEffect.swift`): the [id] is the
 * raw value (analytics, never localised, never reordered).
 */
enum class CallFaceEffect(val id: String) {
    None("none"),
    Smoothing("smoothing"),
    Toad("toad"),
    Angel("angel"),
    Demon("demon"),
    Volcano("volcano"),
    ;

    /** A stylized effect redraws the face (or the scene) instead of retouching it. */
    val isStylized: Boolean
        get() = when (this) {
            None, Smoothing -> false
            Toad, Angel, Demon, Volcano -> true
        }

    /** Whether the effect needs a detected face to draw anything. */
    val needsFace: Boolean
        get() = when (this) {
            None, Volcano -> false
            Smoothing, Toad, Angel, Demon -> true
        }

    val analyticsName: String? get() = if (this == None) null else "face:$id"
}

/** The face effect the config shows: smoothing is carried by its own flag (iOS `activeFaceEffect`). */
val VideoFilterConfig.activeFaceEffect: CallFaceEffect
    get() = when (faceEffect) {
        CallFaceEffect.None, CallFaceEffect.Smoothing -> if (skinSmoothingEnabled) CallFaceEffect.Smoothing else CallFaceEffect.None
        else -> faceEffect
    }

/** Selects [effect]: one face effect at a time, smoothing being the only one that lights its flag. */
fun VideoFilterConfig.selectingFaceEffect(effect: CallFaceEffect): VideoFilterConfig =
    copy(faceEffect = effect, skinSmoothingEnabled = effect == CallFaceEffect.Smoothing)

/**
 * Applies a colour [preset] (`null` = no look, the neutral colorimetry disabled) and KEEPS
 * everything that is not colour: blur, smoothing, face effect, natural complexion. iOS `applyingPreset`.
 */
fun VideoFilterConfig.applyingPreset(preset: VideoFilterPreset?): VideoFilterConfig {
    val look = preset?.config ?: VideoFilterPreset.Natural.config.copy(isEnabled = false)
    return look.copy(
        backgroundBlurEnabled = backgroundBlurEnabled,
        backgroundBlurRadius = backgroundBlurRadius,
        skinSmoothingEnabled = skinSmoothingEnabled,
        skinSmoothingIntensity = skinSmoothingIntensity,
        faceEffect = faceEffect,
        naturalComplexionEnabled = naturalComplexionEnabled,
    )
}

/** The user's brightness offset, bounded to ±[BRIGHTNESS_LIMIT]; it enables the pipeline. */
fun VideoFilterConfig.withBrightness(brightness: Float): VideoFilterConfig =
    copy(brightness = brightness.coerceIn(-BRIGHTNESS_LIMIT, BRIGHTNESS_LIMIT), isEnabled = true)

/** The smoothing strength, never null: a chosen smoothing must stay visible (#9289). */
fun VideoFilterConfig.withSmoothingIntensity(intensity: Float): VideoFilterConfig =
    copy(skinSmoothingIntensity = intensity.coerceIn(SMOOTHING_INTENSITY_MIN, SMOOTHING_INTENSITY_MAX))

fun VideoFilterConfig.withBackgroundBlur(enabled: Boolean): VideoFilterConfig = copy(backgroundBlurEnabled = enabled)

/** The look the config wears, `null` when the colorimetry is off or hand-tuned. */
val VideoFilterConfig.activePreset: VideoFilterPreset?
    get() = if (isEnabled) VideoFilterPreset.matching(this) else null

const val BRIGHTNESS_LIMIT: Float = 0.3f
const val SMOOTHING_INTENSITY_MIN: Float = 0.1f
const val SMOOTHING_INTENSITY_MAX: Float = 1f
