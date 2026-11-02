package me.meeshy.app.stories

import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import me.meeshy.feature.stories.R
import me.meeshy.sdk.model.composer.ComposerPostTextPolicy
import me.meeshy.ui.theme.MeeshySpacing

/** Le compteur discret du texte du post : rien sous 4 000, « utilisé / 5 000 » ensuite, en alerte dès 4 500 (comme iOS). */
@Composable
internal fun PostTextCounter(text: String) {
    val counter = ComposerPostTextPolicy.counter(text) ?: return
    Text(
        text = stringResource(R.string.composer_post_text_counter, counter.used, counter.limit),
        style = MaterialTheme.typography.bodySmall,
        color = if (counter.warns) MaterialTheme.colorScheme.error else Color.White,
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = MeeshySpacing.md, vertical = MeeshySpacing.xxs)
            .semantics { liveRegion = LiveRegionMode.Polite },
    )
}
