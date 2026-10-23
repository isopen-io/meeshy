package me.meeshy.ui.component.chrome

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.statusBars
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyListScope
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.runtime.Composable
import androidx.compose.runtime.derivedStateOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.unit.dp
import me.meeshy.sdk.model.chrome.CollapsibleHeaderMetrics

/**
 * La page a en-tete qui se reduit, en un seul composant (pendant d'iOS `CollapsibleHeaderPage`).
 * Le defilement appartient a la page : elle porte le [androidx.compose.foundation.ScrollState], reserve
 * 64 dp sous l'en-tete et le tient a jour au defilement. Agnostique du produit : les couleurs viennent
 * de l'appelant, comme pour [CollapsibleHeader]. Un ecran Lazy monte [CollapsibleHeaderLazyPage].
 */
@Composable
fun CollapsibleHeaderPage(
    title: String,
    onBack: () -> Unit,
    titleColor: Color,
    backArrowColor: Color,
    backgroundColor: Color,
    modifier: Modifier = Modifier,
    windowInsets: WindowInsets = WindowInsets.statusBars,
    trailing: @Composable RowScope.() -> Unit = {},
    content: @Composable ColumnScope.() -> Unit,
) {
    val scrollState = rememberScrollState()
    val density = LocalDensity.current.density
    val offsetDp by remember(scrollState, density) {
        derivedStateOf { CollapsibleHeaderPageProgress.scrollOffsetDp(scrollState.value, density) }
    }
    Box(modifier.fillMaxSize()) {
        Column(
            Modifier
                .fillMaxSize()
                .verticalScroll(scrollState),
        ) {
            Spacer(
                Modifier
                    .windowInsetsPadding(windowInsets)
                    .height(CollapsibleHeaderMetrics.EXPANDED_HEIGHT.dp),
            )
            content()
        }
        CollapsibleHeader(
            title = title,
            scrollOffsetDp = offsetDp,
            modifier = Modifier.fillMaxWidth(),
            onBack = onBack,
            titleColor = titleColor,
            backArrowColor = backArrowColor,
            backgroundColor = backgroundColor,
            windowInsets = windowInsets,
            actions = trailing,
        )
    }
}

/** Variante pour les ecrans a liste paresseuse : le premier element est l'espace reserve sous l'en-tete. */
@Composable
fun CollapsibleHeaderLazyPage(
    title: String,
    onBack: () -> Unit,
    titleColor: Color,
    backArrowColor: Color,
    backgroundColor: Color,
    modifier: Modifier = Modifier,
    windowInsets: WindowInsets = WindowInsets.statusBars,
    trailing: @Composable RowScope.() -> Unit = {},
    content: LazyListScope.() -> Unit,
) {
    val listState = rememberLazyListState()
    val density = LocalDensity.current.density
    val offsetDp by remember(listState, density) {
        derivedStateOf {
            CollapsibleHeaderPageProgress.lazyOffsetDp(
                listState.firstVisibleItemIndex,
                listState.firstVisibleItemScrollOffset,
                density,
            )
        }
    }
    Box(modifier.fillMaxSize()) {
        LazyColumn(Modifier.fillMaxSize(), state = listState) {
            item(key = "collapsible-header-spacer", contentType = "spacer") {
                Spacer(
                    Modifier
                        .windowInsetsPadding(windowInsets)
                        .height(CollapsibleHeaderMetrics.EXPANDED_HEIGHT.dp),
                )
            }
            content()
        }
        CollapsibleHeader(
            title = title,
            scrollOffsetDp = offsetDp,
            modifier = Modifier.fillMaxWidth(),
            onBack = onBack,
            titleColor = titleColor,
            backArrowColor = backArrowColor,
            backgroundColor = backgroundColor,
            windowInsets = windowInsets,
            actions = trailing,
        )
    }
}
