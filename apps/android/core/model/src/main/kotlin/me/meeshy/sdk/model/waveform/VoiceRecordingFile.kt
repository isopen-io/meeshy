package me.meeshy.sdk.model.waveform

/**
 * Names the destination file for a voice-recording take — chat's composer pill and
 * the Feed post composer's audio-attachment pill both use it. `android.media.MediaRecorder
 * .setOutputFile` needs a concrete `File`/path before `start()` — so a name is needed before
 * the recorder even opens the microphone, mirroring `:feature:feed`'s `CameraCaptureFile`.
 *
 * Pure builder: the instant is an explicit parameter, never read internally, so a fixed
 * timestamp always yields the identical name. `audio/mp4` (the MIME both composers declare
 * when sending the take through their existing attachment pipeline — chat's
 * `AttachmentMessageType.forMime` resolving it to `"audio"`; Feed's `MediaUploadItem`
 * carrying it verbatim) is the container `MediaRecorder.OutputFormat.MPEG_4` +
 * `MediaRecorder.AudioEncoder.AAC` produces — `.m4a` is its conventional extension
 * ([me.meeshy.sdk.model.MimeTypeResolver] already maps `m4a` to `audio/mp4`). The actual
 * `File`/directory creation and the `MediaRecorder` session itself stay coverage-exempt I/O
 * glue app-side, the same precedent as `CameraCaptureFile`. Lives in `:core:model` (moved
 * here from `:feature:chat` — no behaviour change — in `feed-composer-voice-capture`) so both
 * composers share one naming rule instead of drifting via two copies.
 */
object VoiceRecordingFile {
    private const val PREFIX = "voice_"
    private const val EXTENSION = ".m4a"

    /** e.g. `next(1700000000000L) == "voice_1700000000000.m4a"`. */
    fun next(nowMillis: Long): String = "$PREFIX$nowMillis$EXTENSION"
}
