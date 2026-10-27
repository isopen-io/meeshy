package me.meeshy.app.game.progression

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBars
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
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
 * Le gabarit que toutes les pages de Progression partagent (iOS `GamePageScaffold`) : grand titre au repos, barre
 * compacte en défilant, retour en disque de verre, tirer pour rafraîchir. Le défilement ne recompose RIEN : le
 * décalage de l'en-tête est un état dérivé lu par l'en-tête seul, la colonne ne bouge qu'en mise en page.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
internal fun GamePageScaffold(
    title: String,
    onBack: () -> Unit,
    isRefreshing: Boolean,
    onRefresh: () -> Unit,
    modifier: Modifier = Modifier,
    trailing: @Composable RowScope.() -> Unit = {},
    content: @Composable ColumnScope.() -> Unit,
) {
    MeeshyBackground {
        val scroll = rememberScrollState()
        val density = LocalDensity.current.density
        val offsetDp by remember(scroll, density) {
            derivedStateOf { CollapsibleHeaderPageProgress.scrollOffsetDp(scroll.value, density) }
        }
        Box(modifier.fillMaxSize()) {
            PullToRefreshBox(isRefreshing = isRefreshing, onRefresh = onRefresh, modifier = Modifier.fillMaxSize()) {
                Column(
                    Modifier
                        .fillMaxSize()
                        .verticalScroll(scroll)
                        .navigationBarsPadding()
                        .padding(horizontal = MeeshySpacing.lg),
                    verticalArrangement = androidx.compose.foundation.layout.Arrangement.spacedBy(MeeshySpacing.md),
                ) {
                    Spacer(
                        Modifier
                            .windowInsetsPadding(WindowInsets.statusBars)
                            .height(CollapsibleHeaderMetrics.EXPANDED_HEIGHT.dp),
                    )
                    content()
                    Spacer(Modifier.height(MeeshySpacing.xxxl))
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
                actions = trailing,
            )
        }
    }
}
