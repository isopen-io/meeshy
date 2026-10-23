package me.meeshy.ui.component.bubble

import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.PushPin
import androidx.compose.material3.Icon
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import me.meeshy.ui.R
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshySpacing

/**
 * The small pin drawn above a pinned bubble, on its sender side — Android render of the iOS
 * `BubblePinnedIndicator` (the pin alone, theme-invariant `pinnedBlue`; the word stays for
 * the screen reader).
 */
@Composable
internal fun BubblePinnedIndicator() {
    Icon(
        imageVector = Icons.Filled.PushPin,
        contentDescription = stringResource(R.string.bubble_a11y_pinned),
        tint = MeeshyPalette.PinnedBlue,
        modifier = Modifier
            .padding(horizontal = MeeshySpacing.xs)
            .padding(bottom = 2.dp)
            .size(12.dp),
    )
}
