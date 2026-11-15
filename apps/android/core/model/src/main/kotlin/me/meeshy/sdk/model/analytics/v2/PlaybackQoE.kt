package me.meeshy.sdk.model.analytics.v2

/** Les quartiles atteints d'une durée, en bitmask cumulatif : 1 = 25 %, 2 = 50 %, 4 = 75 %, 8 = 100 %. */
object PlaybackQuartiles {
    private val thresholds = listOf(1 to 25, 2 to 50, 4 to 75, 8 to 100)

    fun mask(reachedMs: Int, durationMs: Int): Int {
        if (durationMs <= 0 || reachedMs <= 0) return 0
        return thresholds.fold(0) { mask, (bit, percent) ->
            if (reachedMs.toLong() * 100 >= durationMs.toLong() * percent) mask or bit else mask
        }
    }
}

/**
 * La qualité d'une session de lecture, résumée UNE fois à la fin (méthode Mux / Conviva). Les
 * horloges sont des millisecondes RELATIVES au début de la session, fournies par l'appelant.
 * Miroir de `PlaybackQoEAccumulator` (iOS).
 */
class PlaybackQoEAccumulator(
    val playbackId: String,
    val mediaId: String,
    mediaDurationMs: Int?,
    val mutedAtStart: Boolean,
    val captionsOn: Boolean = false,
) {
    var mediaDurationMs: Int? = mediaDurationMs
        private set

    private var firstFrameMs: Int? = null
    private var playingSinceMs: Int? = null
    private var playedMs = 0
    private var bufferingSinceMs: Int? = null
    private var rebufferCount = 0
    private var rebufferMs = 0
    private var errorCode: Int? = null
    private var errorDomain: String? = null
    private var bitrateSumKbps = 0
    private var bitrateSamples = 0
    private var renditionChanges = 0
    private var loops = 0
    private var pauses = 0
    private var seeks = 0
    private var muteToggles = 0
    private var furthestMs = 0
    private var completedLoopMask = 0

    fun noteFirstFrame(atMs: Int) {
        if (firstFrameMs != null) return
        firstFrameMs = maxOf(0, atMs)
    }

    /** Un buffer vide AVANT la première image est du démarrage, pas un rebuffer. */
    fun noteBufferEmpty(atMs: Int) {
        if (firstFrameMs == null || bufferingSinceMs != null) return
        bufferingSinceMs = atMs
        rebufferCount += 1
    }

    fun noteLikelyToKeepUp(atMs: Int) {
        val since = bufferingSinceMs ?: return
        rebufferMs += maxOf(0, atMs - since)
        bufferingSinceMs = null
    }

    fun notePlaying(atMs: Int) {
        if (playingSinceMs != null) return
        playingSinceMs = atMs
    }

    fun notePaused(atMs: Int) {
        val since = playingSinceMs ?: return
        playedMs += maxOf(0, atMs - since)
        playingSinceMs = null
        pauses += 1
    }

    fun noteSeek() { seeks += 1 }

    /** La durée connue après coup : elle ne remplace pas une durée déjà déclarée. */
    fun noteDuration(ms: Int) {
        if (mediaDurationMs != null || ms <= 0) return
        mediaDurationMs = ms
    }

    /** Une boucle : la passe précédente est allée au bout. */
    fun noteLoop() {
        loops += 1
        mediaDurationMs?.let { furthestMs = maxOf(furthestMs, it) }
        completedLoopMask = ALL_QUARTILES
    }

    fun noteMuteToggled() { muteToggles += 1 }

    fun notePosition(ms: Int) { furthestMs = maxOf(furthestMs, ms) }

    fun noteAccessLog(observedBitrateKbps: Int?, renditionChanged: Boolean) {
        if (observedBitrateKbps != null && observedBitrateKbps > 0) {
            bitrateSumKbps += observedBitrateKbps
            bitrateSamples += 1
        }
        if (renditionChanged) renditionChanges += 1
    }

    /** Le CODE et le domaine seulement — jamais un message (il peut porter une URL). */
    fun noteError(code: Int, domain: String) {
        errorCode = code
        errorDomain = domain.take(DOMAIN_MAX)
    }

    fun finish(atMs: Int, reason: PlaybackSummary.ExitReason): PlaybackSummary {
        val openPlay = playingSinceMs?.let { maxOf(0, atMs - it) } ?: 0
        val openBuffer = bufferingSinceMs?.let { maxOf(0, atMs - it) } ?: 0
        val reached = mediaDurationMs?.let { PlaybackQuartiles.mask(furthestMs, it) } ?: 0
        return PlaybackSummary(
            playbackId = playbackId,
            mediaId = mediaId,
            mediaDurationMs = mediaDurationMs,
            startupMs = firstFrameMs,
            exitBeforeStart = firstFrameMs == null,
            playedMs = playedMs + openPlay,
            rebufferCount = rebufferCount,
            rebufferMs = rebufferMs + openBuffer,
            errorCode = errorCode,
            errorDomain = errorDomain,
            avgBitrateKbps = if (bitrateSamples > 0) bitrateSumKbps / bitrateSamples else null,
            renditionChanges = renditionChanges,
            loops = loops,
            pauses = pauses,
            seeks = seeks,
            mutedAtStart = mutedAtStart,
            muteToggles = muteToggles,
            captionsOn = captionsOn,
            quartiles = reached or completedLoopMask,
            exitReason = if (errorCode != null && reason == PlaybackSummary.ExitReason.OTHER) {
                PlaybackSummary.ExitReason.ERROR
            } else {
                reason
            },
        )
    }

    private companion object {
        const val ALL_QUARTILES = 15
        const val DOMAIN_MAX = 64
    }
}
