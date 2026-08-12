package me.meeshy.sdk.model

/**
 * Which profile image a picked file is destined for. Each target carries its own
 * [maxBytes] ceiling — an avatar is a small square thumbnail while a banner is a
 * wider hero image, so they tolerate different upload sizes. Kept a pure enum in
 * `:core:model`: the "which REST endpoint" routing (avatar vs banner PATCH) is an
 * orchestration decision that lives in the ViewModel, not here.
 */
enum class ImageUploadTarget(val maxBytes: Long) {
    AVATAR(maxBytes = 8L * 1024 * 1024),
    BANNER(maxBytes = 12L * 1024 * 1024),
}

/**
 * Outcome of validating a picked file before it is uploaded as an avatar/banner.
 * A [Rejected] result carries the precise [Reason] so the UI can show an
 * actionable message instead of a generic failure.
 */
sealed interface ImageUploadValidation {
    data object Accepted : ImageUploadValidation
    data class Rejected(val reason: Reason) : ImageUploadValidation

    enum class Reason { EMPTY, UNSUPPORTED_TYPE, TOO_LARGE }
}

/**
 * Pure gate deciding whether a picked file may be uploaded as a profile image.
 *
 * The checks run in priority order so the surfaced reason is the most actionable:
 * an empty pick has no meaningful type or size, a non-image can never be a
 * profile picture regardless of size, and only then does the per-target byte
 * ceiling apply. Kept out of the ViewModel and off `MediaUploadItem` (which lives
 * in `:sdk-core`) by taking primitives, so the branch table stays JVM-testable
 * with no Android runtime.
 */
object ImageUploadValidator {
    private const val IMAGE_MIME_PREFIX = "image/"

    fun validate(
        target: ImageUploadTarget,
        byteCount: Int,
        mimeType: String,
    ): ImageUploadValidation {
        if (byteCount <= 0) return reject(ImageUploadValidation.Reason.EMPTY)
        if (!isImageMime(mimeType)) return reject(ImageUploadValidation.Reason.UNSUPPORTED_TYPE)
        if (byteCount > target.maxBytes) return reject(ImageUploadValidation.Reason.TOO_LARGE)
        return ImageUploadValidation.Accepted
    }

    private fun reject(reason: ImageUploadValidation.Reason): ImageUploadValidation =
        ImageUploadValidation.Rejected(reason)

    /**
     * A MIME is an image when its type token (before any `;` parameter, trimmed and
     * case-folded) starts with `image/`. Handles `IMAGE/JPEG`, `image/png` and a
     * parameterised `image/jpeg; charset=binary`; rejects blank, `video/mp4` and
     * `application/octet-stream`.
     */
    private fun isImageMime(raw: String): Boolean =
        raw.substringBefore(';').trim().lowercase().startsWith(IMAGE_MIME_PREFIX)
}

/**
 * Selects the URL a successful media upload contributes to the profile image.
 * The uploader may return several rows; the avatar/banner uses the first with a
 * usable (non-blank) URL, and `null` when the response carried nothing usable —
 * the caller treats `null` as an upload failure rather than linking a blank URL.
 */
object AvatarBannerUpload {
    fun firstUploadedUrl(uploaded: List<UploadedMedia>): String? =
        uploaded.firstOrNull { it.url.isNotBlank() }?.url
}

/**
 * Merges a freshly uploaded image URL onto a [MeeshyUser] for an instant optimistic
 * paint (ARCHITECTURE.md §4), mirroring [ProfileEditApply] for the avatar/banner
 * case. The single source of truth for the local image-edit merge: the [target]
 * field is overwritten and every other field is left untouched, so the optimistic
 * paint matches exactly what the gateway `PATCH /users/me/{avatar,banner}` persists
 * and a confirmed delivery never visibly re-paints.
 */
object AvatarBannerApply {
    fun apply(user: MeeshyUser, target: ImageUploadTarget, url: String): MeeshyUser =
        when (target) {
            ImageUploadTarget.AVATAR -> user.copy(avatar = url)
            ImageUploadTarget.BANNER -> user.copy(banner = url)
        }
}
