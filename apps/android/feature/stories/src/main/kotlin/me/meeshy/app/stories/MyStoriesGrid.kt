package me.meeshy.app.stories

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import me.meeshy.ui.component.MeeshySkeletonBox
import me.meeshy.ui.theme.MeeshySpacing

private val CellMinWidth = 150.dp
private val GridPadding = PaddingValues(MeeshySpacing.lg)

/** Grille adaptative (cellule ~150 à 180 dp) de cartes 9:16 ; clés stables, présentations immuables. */
@Composable
internal fun MyStoriesGrid(
    cards: List<MyStoryCardPresentation>,
    accentHex: String,
    actions: MyStoryCardActions,
    modifier: Modifier = Modifier,
) {
    LazyVerticalGrid(
        columns = GridCells.Adaptive(CellMinWidth),
        contentPadding = GridPadding,
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.md),
        verticalArrangement = Arrangement.spacedBy(MeeshySpacing.md),
        modifier = modifier.fillMaxSize(),
    ) {
        items(cards, key = { it.id }, contentType = { it.kind }) { card ->
            MyStoryCard(presentation = card, accentHex = accentHex, actions = actions, modifier = Modifier)
        }
    }
}

/** Squelette de grille : seulement sur un cache froid, jamais devant des stories déjà là. */
@Composable
internal fun MyStoriesSkeleton(modifier: Modifier = Modifier) {
    LazyVerticalGrid(
        columns = GridCells.Adaptive(CellMinWidth),
        contentPadding = GridPadding,
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.md),
        verticalArrangement = Arrangement.spacedBy(MeeshySpacing.md),
        userScrollEnabled = false,
        modifier = modifier.fillMaxSize(),
    ) {
        items(6) {
            MeeshySkeletonBox(
                modifier = Modifier.fillMaxWidth().aspectRatio(9f / 16f),
                shape = RoundedCornerShape(16.dp),
            )
        }
    }
}
