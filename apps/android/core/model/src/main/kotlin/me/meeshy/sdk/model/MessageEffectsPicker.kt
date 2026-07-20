package me.meeshy.sdk.model

/**
 * The three groups of pickable message effects in the composer sheet — a direct port
 * of iOS `EffectsPickerView`'s sections (Comportement / Animation d'entrée / Effet
 * permanent). Declaration order is render order.
 */
enum class MessageEffectSection {
    BEHAVIOR,
    ENTRY,
    PERMANENT,
}

/**
 * A single pickable message effect — a pure descriptor pairing a [flag] bit with its
 * [section] and stable [iconKey] / [labelKey] identifiers. Ports the tuples hardcoded
 * in iOS `EffectsPickerView.effectSection`; declaration order within a section is the
 * chip render order. The Compose sheet maps [iconKey] to a vector and [labelKey] to a
 * localized string — the model stays UI-agnostic.
 */
enum class MessageEffectOption(
    val flag: Long,
    val section: MessageEffectSection,
    val iconKey: String,
    val labelKey: String,
) {
    EPHEMERAL(MessageEffectFlags.EPHEMERAL, MessageEffectSection.BEHAVIOR, "hourglass", "ephemeral"),
    BLURRED(MessageEffectFlags.BLURRED, MessageEffectSection.BEHAVIOR, "blur", "blurred"),
    VIEW_ONCE(MessageEffectFlags.VIEW_ONCE, MessageEffectSection.BEHAVIOR, "view_once", "view_once"),
    SHAKE(MessageEffectFlags.SHAKE, MessageEffectSection.ENTRY, "shake", "shake"),
    ZOOM(MessageEffectFlags.ZOOM, MessageEffectSection.ENTRY, "zoom", "zoom"),
    EXPLODE(MessageEffectFlags.EXPLODE, MessageEffectSection.ENTRY, "explode", "explode"),
    CONFETTI(MessageEffectFlags.CONFETTI, MessageEffectSection.ENTRY, "confetti", "confetti"),
    FIREWORKS(MessageEffectFlags.FIREWORKS, MessageEffectSection.ENTRY, "fireworks", "fireworks"),
    WAOO(MessageEffectFlags.WAOO, MessageEffectSection.ENTRY, "waoo", "waoo"),
    GLOW(MessageEffectFlags.GLOW, MessageEffectSection.PERMANENT, "glow", "glow"),
    PULSE(MessageEffectFlags.PULSE, MessageEffectSection.PERMANENT, "pulse", "pulse"),
    RAINBOW(MessageEffectFlags.RAINBOW, MessageEffectSection.PERMANENT, "rainbow", "rainbow"),
    SPARKLE(MessageEffectFlags.SPARKLE, MessageEffectSection.PERMANENT, "sparkle", "sparkle");

    companion object {
        /** The options in [section], in declaration (render) order. */
        fun inSection(section: MessageEffectSection): List<MessageEffectOption> =
            entries.filter { it.section == section }
    }
}

/** Render state for a single effect chip. */
data class EffectOptionState(
    val option: MessageEffectOption,
    val isActive: Boolean,
)

/** Render state for one section of effect chips. */
data class EffectSectionState(
    val section: MessageEffectSection,
    val options: List<EffectOptionState>,
)

/** Render state for a single ephemeral-duration chip. */
data class EphemeralDurationState(
    val duration: EphemeralDuration,
    val isSelected: Boolean,
)

/**
 * The full, immutable render state of the composer effects picker derived from a single
 * [MessageEffects] value — the pure SSOT the iOS View recomputes inline. Surpasses iOS
 * by making the whole sheet a testable value: the Compose sheet is thin glue that renders
 * this and forwards taps to [MessageEffectsEditor].
 */
data class MessageEffectsPickerPresentation(
    val sections: List<EffectSectionState>,
    val showEphemeralDuration: Boolean,
    val ephemeralDurations: List<EphemeralDurationState>,
    val activeCount: Int,
    val showSummary: Boolean,
)

/**
 * Derives the [MessageEffectsPickerPresentation] from the composer's current
 * [MessageEffects] selection — the pure counterpart to [MessageEffectsEditor] (which
 * mutates the selection). Every render decision the iOS `EffectsPickerView` makes inline
 * (which chip is active, whether the ephemeral-duration row shows, which duration is
 * selected, the active-effect summary) is a single arm here:
 *
 * - a chip is active when its [MessageEffectOption.flag] bit is set;
 * - the duration row shows only when the `EPHEMERAL` flag is set (flag authority, mirroring
 *   the encoder's rule that a stale duration with the chip off is ignored);
 * - a duration chip is selected when it matches [MessageEffects.ephemeralDuration];
 * - the summary count is the raw bitfield's population count (iOS
 *   `flags.rawValue.nonzeroBitCount`), so a set bit with no catalog chip still counts.
 */
object MessageEffectsPickerPresenter {
    fun build(effects: MessageEffects): MessageEffectsPickerPresentation {
        val sections = MessageEffectSection.entries.map { section ->
            EffectSectionState(
                section = section,
                options = MessageEffectOption.inSection(section).map { option ->
                    EffectOptionState(option, isActive = effects.has(option.flag))
                },
            )
        }
        val durations = EphemeralDuration.entries.map { duration ->
            EphemeralDurationState(
                duration = duration,
                isSelected = effects.ephemeralDuration == duration.seconds,
            )
        }
        return MessageEffectsPickerPresentation(
            sections = sections,
            showEphemeralDuration = effects.has(MessageEffectFlags.EPHEMERAL),
            ephemeralDurations = durations,
            activeCount = MessageEffectsEditor.activeCount(effects),
            showSummary = effects.hasAnyEffect,
        )
    }
}
