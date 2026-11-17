package me.meeshy.app.chat

/**
 * Filenames for a composer-drawer camera capture (issue #3738) — photo or video.
 * Pure builder mirroring `me.meeshy.app.feed.CameraCaptureFile` (the Feed
 * composer's own camera tile, shipped earlier): the instant is an explicit
 * parameter, never read internally, so a fixed instant always yields the
 * identical name. `feature/chat` cannot depend on `feature/feed` (sibling
 * feature modules, no cross-feature Gradle edge), so this is a deliberate small
 * duplication of naming glue rather than a shared type — this codebase's own
 * established precedent for platform-adjacent glue (see `FeedComposerSheet`'s
 * own doc-comment on `readMediaUploadItem`, duplicated from the story composer
 * for the identical reason). The `chat_` prefix keeps the two composers' capture
 * files from colliding inside the SAME `cacheDir/captures/` FileProvider path
 * (declared once, app-wide, in `app/src/main/res/xml/file_paths.xml` — reused
 * as-is, no manifest change needed for this lot).
 */
object ChatCameraCaptureFile {
    private const val PHOTO_PREFIX = "chat_capture_"
    private const val PHOTO_EXTENSION = ".jpg"
    private const val VIDEO_PREFIX = "chat_video_"
    private const val VIDEO_EXTENSION = ".mp4"
    private const val RETOUCHED_PREFIX = "chat_retouch_"

    /** e.g. `next(1700000000000L) == "chat_capture_1700000000000.jpg"`. */
    fun next(nowMillis: Long): String = "$PHOTO_PREFIX$nowMillis$PHOTO_EXTENSION"

    /** e.g. `nextVideo(1700000000000L) == "chat_video_1700000000000.mp4"`. */
    fun nextVideo(nowMillis: Long): String = "$VIDEO_PREFIX$nowMillis$VIDEO_EXTENSION"

    /** The rendered photo a retouch hands back (#12614), e.g. `"chat_retouch_1700000000000.jpg"`. */
    fun nextRetouched(nowMillis: Long): String = "$RETOUCHED_PREFIX$nowMillis$PHOTO_EXTENSION"

    /**
     * A retouched capture written under a GENERATED [token], keeping only a safe extension (1–5 ASCII letters or
     * digits) of the provider-supplied [displayName]: e.g. `nextRetouchedNamed("ab", "Vacances.PNG") == "chat_retouch_ab.png"`.
     */
    fun nextRetouchedNamed(token: String, displayName: String): String {
        val extension = displayName.substringAfterLast('.', "").lowercase()
            .takeIf { it.length in 1..5 && it.all { c -> c in 'a'..'z' || c in '0'..'9' } }
        return "$RETOUCHED_PREFIX$token" + (extension?.let { ".$it" } ?: PHOTO_EXTENSION)
    }

    /** The copy of a captured video a retouch reads (#12650), e.g. `"chat_video_source_1700000000000.mp4"`. */
    fun nextVideoSource(nowMillis: Long): String = "${VIDEO_PREFIX}source_$nowMillis$VIDEO_EXTENSION"

    /** The rendered video a retouch hands back (#12650), e.g. `"chat_retouch_1700000000000.mp4"`. */
    fun nextRetouchedVideo(nowMillis: Long): String = "$RETOUCHED_PREFIX$nowMillis$VIDEO_EXTENSION"
}
