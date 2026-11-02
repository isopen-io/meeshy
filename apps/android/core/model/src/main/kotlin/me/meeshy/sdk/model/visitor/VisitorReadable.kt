package me.meeshy.sdk.model.visitor

import me.meeshy.sdk.lang.LanguageResolver
import me.meeshy.sdk.lang.ReaderPrism
import me.meeshy.sdk.model.ApiPost
import me.meeshy.sdk.model.ApiPostMedia
import me.meeshy.sdk.model.displayContent
import me.meeshy.sdk.model.isTranslated
import me.meeshy.sdk.model.resolvedCaption

enum class VisitorMediaKind { IMAGE, VIDEO }

/** Un media lisible sans compte : l'adresse brute (a resoudre contre l'origine de l'API par l'hote) et de quoi dessiner. */
data class VisitorMedia(
    val id: String,
    val kind: VisitorMediaKind,
    val url: String,
    val thumbnailUrl: String?,
    val thumbHash: String?,
    val aspectRatio: Float?,
    val altText: String?,
    val caption: String?,
)

/** Le post servi a un visiteur, deja descendu par le Prisme (iOS `toFeedPost(preferredLanguages:)` + `VisitorPostReader`). */
data class VisitorReadable(
    val authorName: String,
    val authorUsername: String?,
    val authorAvatarUrl: String?,
    val text: String,
    val isTranslated: Boolean,
    val media: List<VisitorMedia>,
) {
    /** Le premier media video, le seul qui joue seul (muet). */
    val primaryVideoId: String? get() = media.firstOrNull { it.kind == VisitorMediaKind.VIDEO }?.id
}

private class DevicePrefs(override val deviceLocale: String?) : LanguageResolver.ContentLanguagePreferences {
    override val systemLanguage: String? = null
    override val regionalLanguage: String? = null
    override val customDestinationLanguage: String? = null
}

/**
 * Faute de compte, le Prisme n'a que la locale de l'appareil (rang 4) : la traduction qui lui correspond quand elle
 * existe, l'original sinon — jamais une traduction arbitraire.
 */
fun ApiPost.toVisitorReadable(deviceLocale: String?): VisitorReadable {
    val prefs = DevicePrefs(deviceLocale)
    val languages = ReaderPrism.resolve(prefs)
    return VisitorReadable(
        authorName = author?.displayName?.trim()?.takeIf { it.isNotEmpty() } ?: author?.username.orEmpty(),
        authorUsername = author?.username?.takeIf { it.isNotBlank() },
        authorAvatarUrl = author?.avatar?.takeIf { it.isNotBlank() },
        text = displayContent(prefs).trim(),
        isTranslated = isTranslated(prefs),
        media = media.orEmpty().sortedBy { it.order ?: Int.MAX_VALUE }.mapNotNull { it.toVisitorMedia(languages) },
    )
}

private fun ApiPostMedia.toVisitorMedia(languages: List<String>): VisitorMedia? {
    val url = fileUrl?.takeIf { it.isNotBlank() } ?: return null
    val kind = when {
        mimeType?.startsWith("image/") == true -> VisitorMediaKind.IMAGE
        mimeType?.startsWith("video/") == true -> VisitorMediaKind.VIDEO
        else -> return null
    }
    val w = width
    val h = height
    return VisitorMedia(
        id = id,
        kind = kind,
        url = url,
        thumbnailUrl = thumbnailUrl?.takeIf { it.isNotBlank() },
        thumbHash = thumbHash,
        aspectRatio = if (w != null && h != null && w > 0 && h > 0) w.toFloat() / h else null,
        altText = alt?.takeIf { it.isNotBlank() },
        caption = resolvedCaption(languages)?.takeIf { it.isNotBlank() },
    )
}
