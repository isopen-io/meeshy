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

    /** #18488 — under this stage height the compact avatar tightens again, to leave the pill and the journal their room. */
    const val TIGHT_BELOW_STAGE_DP: Float = 340f
    const val TIGHT_AVATAR_DP: Float = 40f

    /**
     * The video stage has no avatar block: only an audio stage compacts. The journal compacts it (#17529); so does a compact
     * HEIGHT (#18488, [CallGroupStageSizing.isCompactHeight]) while the pill is on the stage — the controls shown, or the
     * captions glass that stays when they are stowed. Controls stowed with no glass, the stage is free and the avatar
     * grows back to 120 dp (#17945).
     */
    fun compacts(
        pillText: CallPillText,
        isVideoStage: Boolean,
        isCompactHeight: Boolean = false,
        controlsShown: Boolean = true,
    ): Boolean = !isVideoStage &&
        (pillText.compactsAudioLayout || (isCompactHeight && (controlsShown || pillText.staysWhenChromeStowed)))

    /** The compact avatar: 56 dp, 40 dp when the stage is lower than [TIGHT_BELOW_STAGE_DP]; an unknown height (0) keeps 56. */
    fun compactAvatarDp(stageHeightDp: Float): Float =
        if (stageHeightDp > 0f && stageHeightDp < TIGHT_BELOW_STAGE_DP) TIGHT_AVATAR_DP else COMPACT_AVATAR_DP

    fun avatarDp(compact: Boolean): Float = if (compact) COMPACT_AVATAR_DP else FULL_AVATAR_DP

    fun morphs(reduceMotion: Boolean): Boolean = !reduceMotion

    fun transitionMillis(reduceMotion: Boolean): Int = if (reduceMotion) CallChromeStow.REDUCED_FADE_MILLIS else MORPH_MILLIS
}
