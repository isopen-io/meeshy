package me.meeshy.app.stories

import android.content.ContentResolver
import android.net.Uri
import android.provider.OpenableColumns
import androidx.compose.runtime.Composable
import androidx.compose.ui.res.stringResource
import me.meeshy.feature.stories.R
import me.meeshy.sdk.media.MediaUploadItem

/**
 * Reads the picked content into a [MediaUploadItem] (bytes + advertised filename +
 * MIME). Returns null when the stream can't be opened. Pure-IO glue — the
 * filename/MIME defaulting lives in `MediaUpload`, so this stays a thin reader.
 */
internal fun ContentResolver.readMediaUploadItem(uri: Uri): MediaUploadItem? {
    val bytes = runCatching { openInputStream(uri)?.use { it.readBytes() } }.getOrNull() ?: return null
    val mimeType = getType(uri).orEmpty()
    val fileName = displayName(uri).orEmpty()
    return MediaUploadItem(bytes = bytes, fileName = fileName, mimeType = mimeType)
}

internal fun ContentResolver.displayName(uri: Uri): String? =
    runCatching {
        query(uri, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)?.use { cursor ->
            val index = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME)
            if (index >= 0 && cursor.moveToFirst()) cursor.getString(index) else null
        }
    }.getOrNull()

/** Ce que le bouton de publication nomme : la story, N stories (une par slide), ou la story et son réel. */
@Composable
internal fun publishLabel(title: me.meeshy.sdk.model.composer.StoryPublishTitle): String = when (title) {
    me.meeshy.sdk.model.composer.StoryPublishTitle.Single -> stringResource(R.string.composer_publish_as_story)
    is me.meeshy.sdk.model.composer.StoryPublishTitle.Many -> stringResource(R.string.stories_composer_publish_many, title.count)
    me.meeshy.sdk.model.composer.StoryPublishTitle.StoryAndReel -> stringResource(R.string.composer_publish_as_storyAndReel)
}
