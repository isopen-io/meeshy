package me.meeshy.app.game.pages

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.statusBars
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyListScope
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.derivedStateOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.unit.dp
import me.meeshy.sdk.model.chrome.CollapsibleHeaderMetrics
import me.meeshy.ui.component.chrome.CollapsibleHeader
import me.meeshy.ui.component.chrome.CollapsibleHeaderPageProgress
import me.meeshy.ui.component.chrome.MeeshyBackground
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

/**
 * Le gabarit des pages du jeu dont la liste PEUT être longue (le classement, la ligue Amis) : le même cadre que
 * `GamePageScaffold` (grand titre, barre compacte, retour, tirer pour rafraîchir), mais en `LazyColumn` — seules les
 * lignes visibles se composent, et chaque ligne porte une clé stable pour que son déplacement s'anime au lieu de
 * sauter. Le décalage de l'en-tête est un état dérivé lu par l'en-tête seul.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
internal fun GameListPageScaffold(
    title: String,
    onBack: () -> Unit,
    isRefreshing: Boolean,
    onRefresh: () -> Unit,
    modifier: Modifier = Modifier,
    content: LazyListScope.() -> Unit,
) {
    MeeshyBackground {
        val listState = rememberLazyListState()
        val density = LocalDensity.current.density
        val offsetDp by remember(listState, density) {
            derivedStateOf {
                val px = if (listState.firstVisibleItemIndex == 0) listState.firstVisibleItemScrollOffset else FAR_PX
                CollapsibleHeaderPageProgress.scrollOffsetDp(px, density)
            }
        }
        Box(modifier.fillMaxSize()) {
            PullToRefreshBox(isRefreshing = isRefreshing, onRefresh = onRefresh, modifier = Modifier.fillMaxSize()) {
                LazyColumn(
                    modifier = Modifier.fillMaxSize().navigationBarsPadding(),
                    state = listState,
                    contentPadding = PaddingValues(horizontal = MeeshySpacing.lg),
                    verticalArrangement = Arrangement.spacedBy(MeeshySpacing.md),
                ) {
                    item(key = "header-space") {
                        Spacer(
                            Modifier
                                .windowInsetsPadding(WindowInsets.statusBars)
                                .height(CollapsibleHeaderMetrics.EXPANDED_HEIGHT.dp),
                        )
                    }
                    content()
                    item(key = "footer-space") { Spacer(Modifier.height(MeeshySpacing.xxxl)) }
                }
            }
            CollapsibleHeader(
                title = title,
                scrollOffsetDp = offsetDp,
                modifier = Modifier.fillMaxWidth(),
                onBack = onBack,
                titleColor = MeeshyTheme.tokens.textPrimary,
                backArrowColor = MeeshyPalette.Indigo500,
                backgroundColor = MeeshyTheme.tokens.backgroundPrimary,
            )
        }
    }
}

private const val FAR_PX = 100_000
