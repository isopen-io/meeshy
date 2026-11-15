package me.meeshy.sdk.model.playback

/**
 * **Où se pose la tête d'un lecteur qu'on retrouve** (iOS `PlaybackResumeLaw`).
 *
 * - déjà sur la reprise ou au-delà (à [PlaybackResumeDeadZone.TOLERANCE_MS] près) : `play` seul, jamais de recul ;
 * - sinon UN seul seek tolérant AVANT `play` ;
 * - un lecteur rendu au pool GARDE sa position quand elle est reprenable (même règle que le magasin de
 *   positions), sinon il revient au début.
 */
public object PlaybackResumeLaw {

    public fun action(savedMs: Long?, currentMs: Long): PlaybackResumeDeadZone.Action =
        PlaybackResumeDeadZone.action(savedMs, currentMs)

    /** La position à laquelle ramener un lecteur rendu au pool ; `null` : il garde la sienne. */
    public fun recycledHeadMs(positionMs: Long, durationMs: Long): Long? =
        if (PlaybackResumeDeadZone.isResumable(positionMs, durationMs)) null else 0L
}
