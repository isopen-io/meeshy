package me.meeshy.ui.component.chrome

import androidx.compose.foundation.layout.RowScope
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.material3.TopAppBarScrollBehavior
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.style.TextOverflow
import me.meeshy.ui.theme.MeeshyTheme

/**
 * The Meeshy top bar — replaces every raw Material `TopAppBar` (parity plan §4.1).
 * Transparent container so the [MeeshyBackground] gradient shows through, with a
 * prominent rounded violet title. Defaults to `displaySmall` (28sp rounded bold);
 * screens with a large iOS-style title pass a bigger [titleStyle] (e.g.
 * `displayLarge` 46sp).
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun MeeshyTopBar(
    title: String,
    modifier: Modifier = Modifier,
    titleStyle: TextStyle = MaterialTheme.typography.displaySmall,
    navigationIcon: @Composable () -> Unit = {},
    actions: @Composable RowScope.() -> Unit = {},
    scrollBehavior: TopAppBarScrollBehavior? = null,
) {
    val tokens = MeeshyTheme.tokens
    TopAppBar(
        title = {
            Text(
                text = title,
                style = titleStyle,
                color = tokens.textPrimary,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
        },
        modifier = modifier,
        navigationIcon = navigationIcon,
        actions = actions,
        colors = TopAppBarDefaults.topAppBarColors(
            containerColor = Color.Transparent,
            scrolledContainerColor = Color.Transparent,
            titleContentColor = tokens.textPrimary,
            navigationIconContentColor = tokens.textPrimary,
            actionIconContentColor = tokens.textSecondary,
        ),
        scrollBehavior = scrollBehavior,
    )
}
