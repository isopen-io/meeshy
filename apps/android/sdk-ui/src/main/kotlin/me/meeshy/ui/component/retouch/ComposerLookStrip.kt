package me.meeshy.ui.component.retouch

import android.graphics.Bitmap
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.gestures.snapping.rememberSnapFlingBehavior
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.runtime.snapshotFlow
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import me.meeshy.sdk.model.composer.look.CallFaceEffect
import me.meeshy.sdk.model.composer.look.CallFaceLandmarks
import me.meeshy.sdk.model.composer.look.ComposerLookCanvas
import me.meeshy.sdk.model.composer.look.ComposerLookFamily
import me.meeshy.sdk.model.composer.look.ComposerLookStripFollow
import me.meeshy.sdk.model.composer.look.ComposerLookStripItem
import me.meeshy.sdk.model.composer.look.ComposerLookStripRule
import me.meeshy.sdk.model.composer.look.ComposerPhotoLook

/**
 * **LA BANDE D'UNE FAMILLE** (#9351, #9566) — miroir de `ComposerLookStrip` (iOS) : « Aucun » en tête, des
 * miniatures VIVANTES (la prise avec la case appliquée, l'autre moitié du look gardée), la case choisie
 * encadrée, son nom dessous ; la case arrivée au centre du défilement est choisie ([ComposerLookStripFollow]).
 * Une bande ne montre qu'une famille à la fois : l'autre moitié du look n'y change pas, ses miniatures se
 * gardent donc le temps qu'elle reste ouverte.
 */
@OptIn(ExperimentalFoundationApi::class)
@Composable
internal fun ComposerLookStrip(
    family: ComposerLookFamily,
    look: ComposerPhotoLook,
    thumbSource: Bitmap,
    author: ComposerLookAuthor,
    selects: Boolean,
    onChoose: (ComposerLookStripItem) -> Unit,
    effects: List<CallFaceEffect> = RetouchRenderableEffects,
    face: CallFaceLandmarks? = null,
) {
    val items = remember(family, effects) { ComposerLookStripRule.items(family, effects = effects) }
    val chosen = ComposerLookStripRule.chosenIndex(items, look)
    val list = rememberLazyListState()
    val scope = rememberCoroutineScope()
    val pitchPx = with(LocalDensity.current) { ComposerLookStripRule.PITCH.dp.toPx() }
    var follow by remember(family) { mutableStateOf(ComposerLookStripFollow().begin(chosen)) }
    val currentChosen by rememberUpdatedState(chosen)
    val currentSelects by rememberUpdatedState(selects)
    val thumbnails = remember(family, face) { mutableStateMapOf<String, Bitmap>() }

    fun choose(index: Int) {
        val step = follow.chose(index)
        follow = step.follow
        onChoose(items[index])
        step.decision?.let { scope.launch { list.animateScrollToItem(it) } }
    }

    LaunchedEffect(family) { chosen?.let { list.animateScrollToItem(it) } }
    LaunchedEffect(family) {
        snapshotFlow { list.firstVisibleItemIndex * pitchPx + list.firstVisibleItemScrollOffset }.collect { scrolled ->
            val centered = ComposerLookStripRule.centeredIndex((scrolled / pitchPx * ComposerLookStripRule.PITCH).toDouble(), items.size) ?: return@collect
            val step = follow.centeredOn(centered, currentChosen, currentSelects)
            follow = step.follow
            step.decision?.let { onChoose(items[it]) }
        }
    }
    LaunchedEffect(family) {
        snapshotFlow { list.isScrollInProgress }.collect { scrolling ->
            if (scrolling) return@collect
            val step = follow.settled(currentChosen, currentSelects)
            follow = step.follow
            when (val rest = step.decision) {
                is ComposerLookStripFollow.Rest.Rejoin -> list.animateScrollToItem(rest.index)
                is ComposerLookStripFollow.Rest.Choose -> onChoose(items[rest.index])
                ComposerLookStripFollow.Rest.Stay -> Unit
            }
        }
    }

    Column(Modifier.fillMaxWidth(), horizontalAlignment = Alignment.CenterHorizontally) {
        BoxWithConstraints(Modifier.fillMaxWidth()) {
            val side = (maxWidth - ComposerLookStripRule.PITCH.dp) / 2
            LazyRow(
                state = list,
                flingBehavior = rememberSnapFlingBehavior(list),
                contentPadding = PaddingValues(horizontal = side.coerceAtLeast(0.dp)),
                modifier = Modifier.fillMaxWidth(),
            ) {
                itemsIndexed(items, key = { _, item -> item.toString() }) { index, item ->
                    StripCell(
                        item = item,
                        isChosen = index == chosen,
                        thumbnail = thumbnails[item.toString()],
                        onTap = { if (selects) choose(index) },
                    )
                    LaunchedEffect(item) {
                        val key = item.toString()
                        if (thumbnails[key] != null) return@LaunchedEffect
                        val combined = ComposerLookStripRule.look(item, look)
                        withContext(Dispatchers.Default) {
                            ComposerLookPainter.paint(thumbSource, combined, author, ComposerLookCanvas.THUMBNAIL_LONG_SIDE, face = face)
                        }?.let { thumbnails[key] = it }
                    }
                }
            }
        }
        chosen?.let {
            Text(
                ComposerRetouchCopy.itemName(items[it]),
                color = Color.White.copy(alpha = 0.85f),
                style = MaterialTheme.typography.labelSmall,
                textAlign = TextAlign.Center,
                modifier = Modifier.padding(top = 4.dp).height(18.dp),
            )
        }
    }
}

@Composable
private fun StripCell(item: ComposerLookStripItem, isChosen: Boolean, thumbnail: Bitmap?, onTap: () -> Unit) {
    val name = ComposerRetouchCopy.itemName(item)
    val shape = RoundedCornerShape(10.dp)
    Box(
        Modifier
            .width(ComposerLookStripRule.PITCH.dp)
            .height(ComposerLookStripRule.CELL_HEIGHT.dp)
            .clickable(role = Role.Button, onClick = onTap)
            .semantics(mergeDescendants = true) {
                contentDescription = name
                selected = isChosen
                role = Role.Button
            },
        contentAlignment = Alignment.Center,
    ) {
        Box(
            Modifier
                .size(ComposerLookStripRule.CELL_WIDTH.dp, ComposerLookStripRule.CELL_HEIGHT.dp)
                .clip(shape)
                .background(Color.White.copy(alpha = 0.08f))
                .border(if (isChosen) 2.dp else 0.dp, if (isChosen) Color.White else Color.Transparent, shape),
        ) {
            thumbnail?.let { Image(it.asImageBitmap(), contentDescription = null, contentScale = ContentScale.Crop, modifier = Modifier.fillMaxSize()) }
        }
    }
}
