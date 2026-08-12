package me.meeshy.ui.component.chrome

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import me.meeshy.ui.theme.MeeshyRadius
import me.meeshy.ui.theme.MeeshySpacing

/**
 * A content card built on [MeeshyGlassSurface] — the glass replacement for every
 * raw Material `Card` (conversation row, post, settings section; parity plan §4.1).
 * Radius `xl`, padding `lg`.
 */
@Composable
fun MeeshyCard(
    modifier: Modifier = Modifier,
    onClick: (() -> Unit)? = null,
    contentPadding: PaddingValues = PaddingValues(MeeshySpacing.lg),
    content: @Composable ColumnScope.() -> Unit,
) {
    val clickable = if (onClick != null) Modifier.clickable(onClick = onClick) else Modifier
    MeeshyGlassSurface(
        modifier = modifier.then(clickable),
        shape = RoundedCornerShape(MeeshyRadius.xl),
    ) {
        Column(Modifier.padding(contentPadding), content = content)
    }
}
