package me.meeshy.app.feed

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.onClick
import androidx.compose.ui.semantics.role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import me.meeshy.feature.feed.R
import me.meeshy.sdk.model.FeedMediaType
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshyRadius

/** La forme de la grille visuelle du détail (iOS `detailVisualGrid`) : 1 cellule pleine, 2 côte à côte, 3 en L, 4 en damier. */
internal enum class DetailGridShape(val heightDp: Int) { ONE(240), TWO(200), THREE(240), FOUR(240) }

/**
 * Une cellule de la grille : le média, son rang parmi les VISUELS du post ([galleryIndex], ce que la galerie reçoit) et, sur la
 * quatrième cellule d'un post de plus de quatre visuels, le nombre de visuels cachés ([overflow], le « +N »).
 */
internal data class DetailGridCell(val item: FeedMediaItem, val galleryIndex: Int, val overflow: Int = 0)

internal data class DetailGridPlan(val shape: DetailGridShape, val cells: List<DetailGridCell>, val visualCount: Int) {
    /** Le « Voir les N médias » de la quatrième cellule : le total des visuels, pas seulement les cachés. */
    val moreLabelCount: Int get() = visualCount
}

/** Ce que la section média du détail montre : un média seul, ou une grille de visuels suivie des audios puis des documents. */
internal sealed interface PostDetailMediaLayout {
    data class Single(val item: FeedMediaItem) : PostDetailMediaLayout
    data class Multi(val grid: DetailGridPlan?, val audios: List<FeedMediaItem>, val documents: List<FeedMediaItem>) : PostDetailMediaLayout
    data object Empty : PostDetailMediaLayout
}

internal object PostDetailMediaGrid {

    /** La grille de [visuals] (images et vidéos, dans l'ordre du post) ; `null` sans visuel. Quatre cellules au plus. */
    fun plan(visuals: List<FeedMediaItem>): DetailGridPlan? {
        if (visuals.isEmpty()) return null
        val shape = when (visuals.size) {
            1 -> DetailGridShape.ONE
            2 -> DetailGridShape.TWO
            3 -> DetailGridShape.THREE
            else -> DetailGridShape.FOUR
        }
        val hidden = (visuals.size - 4).coerceAtLeast(0)
        val cells = visuals.take(4).mapIndexed { index, item ->
            DetailGridCell(item = item, galleryIndex = index, overflow = if (index == 3) hidden else 0)
        }
        return DetailGridPlan(shape = shape, cells = cells, visualCount = visuals.size)
    }

    fun layout(media: List<FeedMediaItem>): PostDetailMediaLayout {
        if (media.isEmpty()) return PostDetailMediaLayout.Empty
        if (media.size == 1) return PostDetailMediaLayout.Single(media.first())
        return PostDetailMediaLayout.Multi(
            grid = plan(FeedCardMediaRouting.visuals(media)),
            audios = media.filter { it.type == FeedMediaType.AUDIO },
            documents = media.filter { it.type == FeedMediaType.DOCUMENT },
        )
    }
}

private val GRID_GAP: Dp = 3.dp

/** La grille visuelle : chaque cellule est celle du fil (image, ou vidéo à poster), un toucher ouvre la galerie sur CE média. */
@Composable
internal fun PostDetailMediaGridView(
    plan: DetailGridPlan,
    accent: Color,
    carrierLanguage: String?,
    onOpen: (galleryIndex: Int) -> Unit,
    modifier: Modifier = Modifier,
) {
    val cells = plan.cells
    Box(
        modifier = modifier
            .fillMaxWidth()
            .height(plan.shape.heightDp.dp)
            .clip(RoundedCornerShape(MeeshyRadius.md)),
    ) {
        when (plan.shape) {
            DetailGridShape.ONE -> Cell(cells[0], plan, accent, carrierLanguage, onOpen, Modifier.fillMaxSize())
            DetailGridShape.TWO -> Row(Modifier.fillMaxSize(), horizontalArrangement = Arrangement.spacedBy(GRID_GAP)) {
                Cell(cells[0], plan, accent, carrierLanguage, onOpen, Modifier.weight(1f).fillMaxSize())
                Cell(cells[1], plan, accent, carrierLanguage, onOpen, Modifier.weight(1f).fillMaxSize())
            }
            DetailGridShape.THREE -> Row(Modifier.fillMaxSize(), horizontalArrangement = Arrangement.spacedBy(GRID_GAP)) {
                Cell(cells[0], plan, accent, carrierLanguage, onOpen, Modifier.weight(1f).fillMaxSize())
                Column(Modifier.weight(1f).fillMaxSize(), verticalArrangement = Arrangement.spacedBy(GRID_GAP)) {
                    Cell(cells[1], plan, accent, carrierLanguage, onOpen, Modifier.weight(1f).fillMaxWidth())
                    Cell(cells[2], plan, accent, carrierLanguage, onOpen, Modifier.weight(1f).fillMaxWidth())
                }
            }
            DetailGridShape.FOUR -> Column(Modifier.fillMaxSize(), verticalArrangement = Arrangement.spacedBy(GRID_GAP)) {
                Row(Modifier.weight(1f).fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(GRID_GAP)) {
                    Cell(cells[0], plan, accent, carrierLanguage, onOpen, Modifier.weight(1f).fillMaxSize())
                    Cell(cells[1], plan, accent, carrierLanguage, onOpen, Modifier.weight(1f).fillMaxSize())
                }
                Row(Modifier.weight(1f).fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(GRID_GAP)) {
                    Cell(cells[2], plan, accent, carrierLanguage, onOpen, Modifier.weight(1f).fillMaxSize())
                    Cell(cells[3], plan, accent, carrierLanguage, onOpen, Modifier.weight(1f).fillMaxSize())
                }
            }
        }
    }
}

@Composable
private fun Cell(
    cell: DetailGridCell,
    plan: DetailGridPlan,
    accent: Color,
    carrierLanguage: String?,
    onOpen: (Int) -> Unit,
    modifier: Modifier,
) {
    val item = cell.item
    val openHint = stringResource(R.string.post_detail_media_open_hint)
    Box(modifier = modifier.clip(RoundedCornerShape(MeeshyRadius.xs)).background(FEED_MEDIA_GROUND)) {
        FeedMediaCell(
            item = item,
            accent = accent,
            carrierLanguage = carrierLanguage,
            description = detailCellDescription(item),
            onOpen = { onOpen(cell.galleryIndex) },
            modifier = Modifier.fillMaxSize(),
        )
        if (cell.overflow > 0) {
            val moreLabel = stringResource(R.string.post_detail_media_more, plan.moreLabelCount)
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .background(Color.Black.copy(alpha = 0.5f))
                    .clickable(onClickLabel = openHint) { onOpen(cell.galleryIndex) }
                    .clearAndSetSemantics {
                        contentDescription = moreLabel
                        role = Role.Button
                        onClick(label = openHint) { onOpen(cell.galleryIndex); true }
                    },
                contentAlignment = Alignment.Center,
            ) {
                Text(
                    text = "+${cell.overflow}",
                    color = MeeshyPalette.White,
                    fontWeight = FontWeight.Bold,
                    fontSize = 18.sp,
                )
            }
        }
    }
}

/** TalkBack d'une cellule de grille : le texte alternatif de l'auteur, sinon « Image partagée » / « Vidéo partagée ». */
@Composable
internal fun detailCellDescription(item: FeedMediaItem): String =
    item.accessibilityDescription ?: stringResource(
        if (item.type == FeedMediaType.VIDEO) R.string.post_detail_media_video else R.string.post_detail_media_image,
    )
