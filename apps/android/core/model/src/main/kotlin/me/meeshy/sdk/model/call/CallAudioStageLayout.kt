package me.meeshy.sdk.model.call

/**
 * #17529 — on an audio call, the journal open in the pill SHRINKS the avatar: from [FULL_AVATAR_DP] to
 * [COMPACT_AVATAR_DP], at the top, the name and the duration beside it (law 6 of `docs/product/appels-vue-finale.md`,
 * view P9b; iOS `CallCompactAudioHeader`). Closing the journal, opening (…) over it or stowing the pill gives the avatar
 * back its size. The passage is a morph — the stage slides and shrinks toward the header while the header fades in —
 * moved by the transform and the opacity only; « Reduce animations » turns it into a short fade, with no movement.
 */
object CallAudioStageLayout {
    const val FULL_AVATAR_DP: Float = 120f
    const val COMPACT_AVATAR_DP: Float = 56f
    const val MORPH_MILLIS: Int = 200

    /** The scale the full stage reaches as it leaves for the compact header, and starts from as it comes back. */
    const val SHRINK_SCALE: Float = COMPACT_AVATAR_DP / FULL_AVATAR_DP

    /** The video stage has no avatar block: only an audio stage compacts. */
    fun compacts(pillText: CallPillText, isVideoStage: Boolean): Boolean = !isVideoStage && pillText.compactsAudioLayout

    fun avatarDp(compact: Boolean): Float = if (compact) COMPACT_AVATAR_DP else FULL_AVATAR_DP

    fun morphs(reduceMotion: Boolean): Boolean = !reduceMotion

    fun transitionMillis(reduceMotion: Boolean): Int = if (reduceMotion) CallChromeStow.REDUCED_FADE_MILLIS else MORPH_MILLIS
}
