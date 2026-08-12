package me.meeshy.app.feed

/**
 * Which system photo-picker the composer should launch for the slots that
 * remain in the draft — the Feed counterpart of
 * `me.meeshy.app.stories.StoryMediaPickMode`. Modelled as a pure decision
 * because Android's
 * [androidx.activity.result.contract.ActivityResultContracts.PickMultipleVisualMedia]
 * rejects `maxItems <= 1` (it throws at construction), so the choice between
 * the single- and multi-item picker is a real, crash-avoiding rule — not glue.
 */
enum class FeedMediaPickMode {
    /** No free slots remain — the picker must not launch. */
    None,

    /** Exactly one free slot — launch the single-item picker. */
    Single,

    /** Two or more free slots — launch the multi-item picker. */
    Multiple,
}

/** Pure router from remaining media slots to the picker mode to launch. */
object FeedMediaPicker {
    fun modeFor(remainingSlots: Int): FeedMediaPickMode = when {
        remainingSlots <= 0 -> FeedMediaPickMode.None
        remainingSlots == 1 -> FeedMediaPickMode.Single
        else -> FeedMediaPickMode.Multiple
    }
}
