package me.meeshy.app.feed

import androidx.compose.animation.animateContentSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.key
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import me.meeshy.feature.feed.R

/**
 * The text of a slide is the caption of ITS media (iOS `ComposerSlideTextRole.caption`): one field per media, keyed so switching
 * slides shows the caption of the one now current. Distinct from the post's content and from the alt. Shared by the plateau and
 * the modal sheet — the same field, the same wording (`composer.description.amorce`).
 */
@Composable
internal fun PostCaptionField(mediaId: String, value: String, onChange: (String, String) -> Unit, modifier: Modifier = Modifier) {
    key(mediaId) {
        OutlinedTextField(
            value = value,
            onValueChange = { onChange(mediaId, it) },
            modifier = modifier.fillMaxWidth().animateContentSize(),
            label = { Text(stringResource(R.string.feed_composer_caption_placeholder)) },
            minLines = 2,
        )
    }
}
