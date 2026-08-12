package me.meeshy.app.stories

/**
 * Which system photo-picker the composer should launch for the slots that remain
 * in the draft. Modelled as a pure decision because Android's
 * [androidx.activity.result.contract.ActivityResultContracts.PickMultipleVisualMedia]
 * rejects `maxItems <= 1` (it throws at construction), so the choice between the
 * single- and multi-item picker is a real, crash-avoiding rule — not glue.
 */
enum class StoryMediaPickMode {
    /** No free slots remain — the picker must not launch. */
    None,

    /** Exactly one free slot — launch the single-item picker. */
    Single,

    /** Two or more free slots — launch the multi-item picker. */
    Multiple,
}

/** Pure router from remaining media slots to the picker mode to launch. */
object StoryMediaPicker {
    fun modeFor(remainingSlots: Int): StoryMediaPickMode = when {
        remainingSlots <= 0 -> StoryMediaPickMode.None
        remainingSlots == 1 -> StoryMediaPickMode.Single
        else -> StoryMediaPickMode.Multiple
    }
}
