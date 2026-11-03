package me.meeshy.ui.component.viewer

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.AutoAwesome
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material3.Icon
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.onClick
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import coil.compose.AsyncImage
import me.meeshy.sdk.model.GalleryPage
import me.meeshy.sdk.model.GalleryPageKind
import me.meeshy.ui.R
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshyRadius
import me.meeshy.ui.theme.MeeshySpacing

/**
 * **La pellicule de la galerie sociale** — les images et vidéos du post PUIS les médias de ses commentaires, dans l'ordre
 * des pages. La page active est soulignée de l'ACCENT passé en paramètre (jamais une couleur écrite ici) ; une vidéo
 * porte un triangle de lecture, une scène une étincelle, pour qu'on les reconnaisse sans les ouvrir.
 */
@Composable
public fun MediaFilmstrip(
    pages: List<GalleryPage>,
    current: Int,
    accent: Color,
    onSelect: (Int) -> Unit,
    modifier: Modifier = Modifier,
) {
    if (pages.size < 2) return
    val listState = rememberLazyListState()
    LaunchedEffect(current) { listState.animateScrollToItem((current - 2).coerceAtLeast(0)) }
    LazyRow(
        state = listState,
        modifier = modifier.fillMaxWidth().padding(vertical = MeeshySpacing.sm),
        contentPadding = PaddingValues(horizontal = MeeshySpacing.lg),
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.sm),
    ) {
        itemsIndexed(pages, key = { _, page -> page.id }, contentType = { _, page -> page.kind }) { index, page ->
            FilmstripTile(page = page, isCurrent = index == current, accent = accent, position = index, total = pages.size, onSelect = onSelect)
        }
    }
}

@Composable
private fun FilmstripTile(
    page: GalleryPage,
    isCurrent: Boolean,
    accent: Color,
    position: Int,
    total: Int,
    onSelect: (Int) -> Unit,
) {
    val label = stringResource(R.string.viewer_position, position + 1, total)
    val shape = RoundedCornerShape(MeeshyRadius.sm)
    Box(
        modifier = Modifier
            .size(TILE)
            .clip(shape)
            .background(MeeshyPalette.White.copy(alpha = 0.08f))
            .clickable { onSelect(position) }
            .semantics {
                contentDescription = label
                role = Role.Button
                selected = isCurrent
                onClick(label = label) { onSelect(position); true }
            },
        contentAlignment = Alignment.Center,
    ) {
        AsyncImage(
            model = page.thumbnailUrl ?: page.url.takeIf { page.kind == GalleryPageKind.IMAGE },
            contentDescription = null,
            contentScale = ContentScale.Crop,
            modifier = Modifier.size(TILE),
        )
        when (page.kind) {
            GalleryPageKind.VIDEO -> Icon(Icons.Filled.PlayArrow, contentDescription = null, tint = MeeshyPalette.White, modifier = Modifier.size(BADGE))
            GalleryPageKind.SCENE -> Icon(Icons.Filled.AutoAwesome, contentDescription = null, tint = MeeshyPalette.White, modifier = Modifier.size(BADGE))
            GalleryPageKind.IMAGE -> Unit
        }
        if (isCurrent) {
            Box(Modifier.align(Alignment.BottomCenter).fillMaxWidth().height(UNDERLINE).background(accent))
        }
    }
}

private val TILE = 48.dp
private val BADGE = 20.dp
private val UNDERLINE = 3.dp
