package me.meeshy.app.stories

import android.content.ContentResolver
import android.net.Uri
import android.provider.OpenableColumns
import androidx.compose.runtime.Composable
import androidx.compose.ui.res.stringResource
import me.meeshy.feature.stories.R
import me.meeshy.sdk.media.MediaUploadItem
import me.meeshy.sdk.model.composer.StoryPublishTitle

internal fun ContentResolver.displayName(uri: Uri): String? =
    runCatching {
        query(uri, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)?.use { cursor ->
            val index = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME)
            if (index >= 0 && cursor.moveToFirst()) cursor.getString(index) else null
        }
    }.getOrNull()

/** Ce que le bouton de publication nomme : la story, N stories (une par slide), ou chaque format coché (#13919). */
@Composable
internal fun publishLabel(title: StoryPublishTitle): String = when (title) {
    StoryPublishTitle.Single -> stringResource(R.string.composer_publish_as_story)
    is StoryPublishTitle.Many -> stringResource(R.string.stories_composer_publish_many, title.count)
    StoryPublishTitle.Save -> stringResource(R.string.story_edit_save)
    StoryPublishTitle.StoryAndReel -> stringResource(R.string.composer_publish_as_storyAndReel)
    StoryPublishTitle.StoryAndPost -> stringResource(R.string.composer_publish_as_storyAndPost)
    StoryPublishTitle.PostAndReel -> stringResource(R.string.composer_publish_as_postAndReel)
    StoryPublishTitle.StoryPostAndReel -> stringResource(R.string.composer_publish_as_storyPostAndReel)
    StoryPublishTitle.Post -> stringResource(R.string.composer_publish_as_post)
    StoryPublishTitle.Reel -> stringResource(R.string.composer_publish_as_reel)
}
