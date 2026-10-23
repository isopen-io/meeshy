package me.meeshy.app.conversations

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.ime
import androidx.compose.foundation.layout.navigationBars
import androidx.compose.foundation.layout.union
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Cancel
import androidx.compose.material.icons.filled.GridView
import androidx.compose.material.icons.filled.ManageSearch
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import me.meeshy.feature.conversations.R
import me.meeshy.ui.component.chrome.MeeshyGlassSurface
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshyRadius
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

/** iOS parity: a floating glass search pill anchored to the bottom of the screen.
 *  Trailing, comme iOS `themedSearchBar` : l'icone grille ouvre le tableau de
 *  bord (`square.grid.2x2` -> WidgetPreview) et la loupe-texte la recherche
 *  globale (`text.magnifyingglass` -> GlobalSearch). */
@Composable
internal fun ConversationSearchBar(
    query: String,
    onQueryChange: (String) -> Unit,
    onFocusChange: (Boolean) -> Unit = {},
    onDashboard: () -> Unit = {},
    onGlobalSearch: () -> Unit = {},
) {
    MeeshyGlassSurface(
        shape = RoundedCornerShape(MeeshyRadius.pill),
        // Edge-to-edge: the pill rides above the gesture bar at rest and above the keyboard
        // while typing (parity iOS: the bar lifts with the keyboard).
        modifier = Modifier
            .windowInsetsPadding(WindowInsets.navigationBars.union(WindowInsets.ime))
            .fillMaxWidth()
            .padding(horizontal = MeeshySpacing.lg, vertical = MeeshySpacing.sm),
    ) {
        Row(
            modifier = Modifier.padding(horizontal = MeeshySpacing.lg, vertical = MeeshySpacing.md),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Icon(
                imageVector = Icons.Filled.Search,
                contentDescription = null,
                tint = MeeshyTheme.tokens.textMuted,
                modifier = Modifier.size(20.dp),
            )
            BasicTextField(
                value = query,
                onValueChange = onQueryChange,
                singleLine = true,
                textStyle = MaterialTheme.typography.bodyMedium.copy(color = MeeshyTheme.tokens.textPrimary),
                cursorBrush = SolidColor(MeeshyPalette.Indigo500),
                modifier = Modifier
                    .weight(1f)
                    .padding(start = MeeshySpacing.sm)
                    .onFocusChanged { onFocusChange(it.isFocused) },
                decorationBox = { inner ->
                    Box(contentAlignment = Alignment.CenterStart) {
                        if (query.isEmpty()) {
                            Text(
                                text = stringResource(R.string.conversations_search_hint),
                                style = MaterialTheme.typography.bodyMedium,
                                color = MeeshyTheme.tokens.textMuted,
                            )
                        }
                        inner()
                    }
                },
            )
            if (query.isNotEmpty()) {
                IconButton(onClick = { onQueryChange("") }, modifier = Modifier.size(32.dp)) {
                    Icon(
                        imageVector = Icons.Filled.Cancel,
                        contentDescription = stringResource(R.string.conversations_search_clear),
                        tint = MeeshyTheme.tokens.error,
                        modifier = Modifier.size(18.dp),
                    )
                }
            }
            IconButton(onClick = onDashboard, modifier = Modifier.size(32.dp)) {
                Icon(
                    imageVector = Icons.Filled.GridView,
                    contentDescription = stringResource(R.string.conversations_open_dashboard),
                    tint = MeeshyPalette.Warning,
                    modifier = Modifier.size(20.dp),
                )
            }
            Spacer(Modifier.width(MeeshySpacing.sm))
            IconButton(onClick = onGlobalSearch, modifier = Modifier.size(32.dp)) {
                Icon(
                    imageVector = Icons.Filled.ManageSearch,
                    contentDescription = stringResource(R.string.conversations_open_global_search),
                    tint = MeeshyPalette.Indigo500,
                    modifier = Modifier.size(22.dp),
                )
            }
        }
    }
}
