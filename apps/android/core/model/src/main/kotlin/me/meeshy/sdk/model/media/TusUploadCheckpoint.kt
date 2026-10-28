package me.meeshy.sdk.model.media

/**
 * Deterministic identity for a TUS upload attempt, stable across retries of the same
 * content but distinct for genuinely different content. [totalBytes] rides in the key
 * (not compared separately) so a retry whose source content changed size never matches a
 * stale row — [TusUploadRepository][me.meeshy.sdk.media.TusUploadRepository] simply won't
 * find it, which is equivalent to (and simpler than) an explicit size-mismatch check.
 *
 * Deliberately content-agnostic (no hash of [MediaUploadItem.bytes][me.meeshy.sdk.media
 * .MediaUploadItem.bytes]): every capture path that benefits from resuming a large,
 * multi-chunk upload (`CameraCaptureFile`, `VoiceRecordingFile`) already names its file
 * with a millis-precision timestamp, and a picked gallery item keeps its
 * `ContentResolver` display name across a retry of the same pick — so `context +
 * fileName + mimeType + totalBytes` is already a strong, cheap identity for "the same
 * upload attempt, retried" without paying to hash potentially tens of megabytes on every
 * call.
 */
public object TusCheckpointKey {
    public fun of(context: TusUploadContext, fileName: String, mimeType: String, totalBytes: Long): String =
        "${context.wire}:$fileName:$mimeType:$totalBytes"
}

/**
 * Whether [TusUploadRepository.upload][me.meeshy.sdk.media.TusUploadRepository.upload]
 * should resume an existing TUS session or start a brand new one. Port of the resume
 * half of iOS's TUS story — Android had none until this checkpoint (`feature-parity.md`
 * §Q, the "persistent checkpoint" follow-up flagged by `tus-chunked-upload-core`).
 */
public sealed interface TusResumeDecision {
    /** Start a brand-new TUS session (`POST /uploads`) from offset zero. */
    public data object Fresh : TusResumeDecision

    /** Reuse [location], PATCH-ing only the chunks starting at or after [resumeOffsetBytes]. */
    public data class Resume(val location: String, val resumeOffsetBytes: Long) : TusResumeDecision
}

/**
 * Pure decision of [TusResumeDecision] from a checkpoint row's last-known state (if any).
 * Deliberately conservative: a resume is only attempted once **at least one intermediate
 * chunk has actually been acknowledged** by the gateway ([existingUploadedBytes] > 0).
 *
 * This is a real safety trade-off, not an oversight: this repository does not yet
 * HEAD-verify the gateway's own view of the session's offset before resuming (tracked
 * separately, `feature-parity.md` §Q — "409 HEAD-recovery"), so trusting an
 * unconfirmed/zero-progress checkpoint could PATCH at the wrong offset against a session
 * that may already be stale or expired server-side. Requiring confirmed progress first
 * means resume only ever kicks in for genuinely large, multi-chunk uploads that failed
 * partway through — exactly the case worth the added complexity — while a small,
 * single-chunk upload (the common case: compressed images) always behaves exactly as
 * before this checkpoint existed.
 */
public object TusResumePlanner {
    public fun plan(
        existingLocation: String?,
        existingUploadedBytes: Long,
        totalBytes: Long,
    ): TusResumeDecision {
        if (existingLocation.isNullOrBlank()) return TusResumeDecision.Fresh
        if (existingUploadedBytes <= 0L) return TusResumeDecision.Fresh
        if (existingUploadedBytes >= totalBytes) return TusResumeDecision.Fresh
        return TusResumeDecision.Resume(location = existingLocation, resumeOffsetBytes = existingUploadedBytes)
    }

    /**
     * Reconciles a stored session with what the gateway reports for it — the half of tus resume the
     * local checkpoint alone cannot do (#13429). The checkpoint only knows the last PATCH this device saw
     * acknowledged; the gateway knows what it really holds. Resuming from the checkpoint against a session
     * the gateway forgot failed on every retry (the stale row was never cleared), and resuming at a stale
     * offset after a lost acknowledgement earned a `409` forever.
     */
    public fun reconcile(location: String, probe: TusServerProbe, totalBytes: Long): TusResumeDecision =
        when (probe) {
            TusServerProbe.Gone -> TusResumeDecision.Fresh
            is TusServerProbe.Offset ->
                // A session complete server-side has lost its finish answer (the attachment): the only way
                // back to a media id is a fresh session.
                if (probe.bytes < 0L || probe.bytes >= totalBytes) {
                    TusResumeDecision.Fresh
                } else {
                    TusResumeDecision.Resume(location = location, resumeOffsetBytes = probe.bytes)
                }
        }
}

/** What the gateway answered to a `HEAD` on a stored session: its real offset, or that it forgot the session. */
public sealed interface TusServerProbe {
    /** The session lives and has received exactly [bytes] bytes. */
    public data class Offset(val bytes: Long) : TusServerProbe

    /** `404`/`410`: the session expired or was swept — the checkpoint points at nothing. */
    public data object Gone : TusServerProbe
}
