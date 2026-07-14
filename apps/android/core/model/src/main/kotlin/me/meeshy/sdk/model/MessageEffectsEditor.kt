package me.meeshy.sdk.model

/**
 * Ephemeral (self-destruct) durations offered by the composer effects picker —
 * port of iOS `EphemeralDuration` (CoreModels.swift). The [seconds] raw value is
 * the shared wire contract carried by [MessageEffects.ephemeralDuration], so the
 * integers are pinned by tests; the human-facing labels live in the picker's string
 * resources (a UI concern), never in this pure model.
 */
enum class EphemeralDuration(val seconds: Int) {
    THIRTY_SECONDS(30),
    ONE_MINUTE(60),
    FIVE_MINUTES(300),
    ONE_HOUR(3600),
    TWENTY_FOUR_HOURS(86400);

    companion object {
        /**
         * The duration whose [EphemeralDuration.seconds] equals [seconds], or `null`
         * when none match (an unknown/legacy value, or `null` seconds) — mirrors iOS
         * `EphemeralDuration(rawValue:)`.
         */
        fun fromSeconds(seconds: Int?): EphemeralDuration? =
            if (seconds == null) null else entries.firstOrNull { it.seconds == seconds }
    }
}

/**
 * Pure state transitions for the composer's message-effects picker — the send-side
 * counterpart to [MessageEffectsResolver]. Ports the interaction logic of iOS
 * `EffectsPickerView` (toggle a chip, choose an ephemeral duration, clear all, count
 * the active effects) as agnostic functions over the immutable [MessageEffects]
 * value. The Compose picker is the thin, coverage-exempt glue that renders them.
 */
object MessageEffectsEditor {
    /**
     * Flip [flag] in [effects]: set it when absent, clear it when present, leaving
     * every other bit and every parameter untouched — mirrors iOS
     * `if isSelected { flags.remove(flag) } else { flags.insert(flag) }`.
     */
    fun toggle(effects: MessageEffects, flag: Long): MessageEffects =
        if (MessageEffectFlags.has(effects.flags, flag)) {
            effects.copy(flags = effects.flags and flag.inv())
        } else {
            effects.copy(flags = effects.flags or flag)
        }

    /**
     * Record the chosen ephemeral [duration] on [effects] — mirrors the iOS picker
     * setting `effects.ephemeralDuration = duration.rawValue`. Only the parameter is
     * written: the `EPHEMERAL` flag is owned by [toggle] (the duration row only shows
     * once that chip is already on), so the flags bitfield is left unchanged.
     */
    fun withEphemeralDuration(effects: MessageEffects, duration: EphemeralDuration): MessageEffects =
        effects.copy(ephemeralDuration = duration.seconds)

    /** The empty effects — the picker's "Tout effacer" resetting to iOS `.none`. */
    fun cleared(): MessageEffects = MessageEffects()

    /**
     * How many effect bits are active — the picker's "%d effet(s) actif(s)" summary,
     * mirroring iOS `effects.flags.rawValue.nonzeroBitCount`.
     */
    fun activeCount(effects: MessageEffects): Int = effects.flags.countOneBits()
}
