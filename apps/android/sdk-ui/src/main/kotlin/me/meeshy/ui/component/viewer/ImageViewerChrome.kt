package me.meeshy.ui.component.viewer

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.BrokenImage
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Shadow
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.onClick
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import coil.compose.AsyncImage
import me.meeshy.sdk.model.MediaCaptionRule
import me.meeshy.sdk.model.fullscreen.FullscreenChromeSymbol
import me.meeshy.ui.R
import me.meeshy.ui.component.fullscreen.FullscreenChromeButton
import me.meeshy.ui.component.fullscreen.FullscreenChromeDimens
import me.meeshy.ui.component.fullscreen.FullscreenCloseButton
import me.meeshy.ui.component.fullscreen.icon
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshyRadius
import me.meeshy.ui.theme.MeeshySpacing

private val CAPTION_SHADOW = Shadow(color = MeeshyPalette.Ink.copy(alpha = 0.65f), offset = Offset(0f, 1f), blurRadius = 6f)

/** La pellicule (iOS `FilmstripMetrics`) : vignettes de 54, espacées de 6. */
private val FILMSTRIP_ITEM = 54.dp
private val FILMSTRIP_SPACING = 6.dp
private val FILMSTRIP_VERTICAL = 10.dp
private val FILMSTRIP_BOTTOM = 6.dp
private val FILMSTRIP_EDGE = 12.dp

/** Une légende dépliée reste bornée : le média reste visible au-dessus (iOS `maxExpandedHeight`). */
private val CAPTION_MAX_EXPANDED_HEIGHT = 220.dp

/**
 * La barre haute du plein écran : la croix au début (disque de verre du kit), le menu ⋯ des
 * sorties à la fin. Pas de compteur « n / N » : la pellicule du bas montre la position.
 */
@Composable
internal fun ImageViewerTopBar(
    onClose: () -> Unit,
    exits: List<ImageViewerExit>,
    isBusy: Boolean,
    onExit: (ImageViewerExit) -> Unit,
    modifier: Modifier = Modifier,
) {
    Row(
        modifier = modifier
            .fillMaxWidth()
            .padding(horizontal = FullscreenChromeDimens.topBarHorizontalPadding, vertical = FullscreenChromeDimens.topInset),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.SpaceBetween,
    ) {
        FullscreenCloseButton(onClick = onClose)
        if (exits.isNotEmpty()) {
            ImageViewerMoreMenu(exits = exits, isBusy = isBusy, onExit = onExit)
        }
    }
}

/**
 * Le menu ⋯ des sorties — miroir de `FullscreenMoreMenu` : Enregistrer, puis « Partager hors de
 * Meeshy ». Pendant une sortie, le disque porte un anneau et s'annonce « Enregistrement… ».
 */
@Composable
private fun ImageViewerMoreMenu(
    exits: List<ImageViewerExit>,
    isBusy: Boolean,
    onExit: (ImageViewerExit) -> Unit,
) {
    var expanded by remember { mutableStateOf(false) }
    val savingLabel = stringResource(R.string.viewer_saving)
    Box {
        FullscreenChromeButton(
            icon = FullscreenChromeSymbol.More.icon,
            label = stringResource(R.string.viewer_more),
            onClick = { if (!isBusy) expanded = true },
            modifier = Modifier.semantics { if (isBusy) stateDescription = savingLabel },
        )
        if (isBusy) {
            CircularProgressIndicator(
                color = MeeshyPalette.White,
                strokeWidth = 2.dp,
                modifier = Modifier
                    .align(Alignment.Center)
                    .size(FullscreenChromeDimens.discDiameter),
            )
        }
        DropdownMenu(expanded = expanded, onDismissRequest = { expanded = false }) {
            exits.forEach { exit ->
                val (label, symbol) = when (exit) {
                    ImageViewerExit.Save -> stringResource(R.string.viewer_save) to FullscreenChromeSymbol.Save
                    ImageViewerExit.Share -> stringResource(R.string.viewer_share_outside) to FullscreenChromeSymbol.Share
                }
                DropdownMenuItem(
                    text = { Text(label) },
                    leadingIcon = { Icon(symbol.icon, contentDescription = null) },
                    onClick = {
                        expanded = false
                        onExit(exit)
                    },
                )
            }
        }
    }
}

/**
 * Le bas du cadre : l'auteur et la date, puis la légende, alignés à gauche (iOS
 * `GalleryMediaMetadataBlock` au-dessus de `MediaCaptionOverlay`).
 */
@Composable
internal fun ImageViewerMetadataBlock(
    author: String?,
    timestamp: String?,
    caption: String?,
    captionKey: Any,
    modifier: Modifier = Modifier,
) {
    if (author == null && timestamp == null && caption == null) return
    Column(
        modifier = modifier
            .fillMaxWidth()
            .padding(horizontal = MeeshySpacing.lg),
        verticalArrangement = Arrangement.spacedBy(MeeshySpacing.xs),
    ) {
        if (author != null || timestamp != null) {
            Text(
                text = listOfNotNull(author, timestamp).joinToString("  ·  "),
                style = MaterialTheme.typography.labelLarge.copy(shadow = CAPTION_SHADOW),
                fontWeight = FontWeight.SemiBold,
                color = MeeshyPalette.White,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
        }
        if (caption != null) {
            ImageViewerCaption(text = caption, captionKey = captionKey)
        }
    }
}

/**
 * La légende repliée — la règle partagée [MediaCaptionRule] (15 mots de tête au-delà de 30),
 * ombrée plutôt qu'encadrée, dépliée et repliée par « voir plus » / « voir moins ». Chaque page
 * repart repliée.
 */
@Composable
private fun ImageViewerCaption(text: String, captionKey: Any) {
    var expanded by rememberSaveable(captionKey) { mutableStateOf(false) }
    val folded = remember(text) { MediaCaptionRule.collapse(text) }
    val shown = if (expanded || !folded.isTruncated) text else folded.head + "…"
    Column(modifier = Modifier.heightIn(max = CAPTION_MAX_EXPANDED_HEIGHT)) {
        Text(
            text = shown,
            color = MeeshyPalette.White,
            style = MaterialTheme.typography.bodyMedium.copy(shadow = CAPTION_SHADOW),
            modifier = Modifier.weight(1f, fill = false),
        )
        if (folded.isTruncated) {
            val hint = stringResource(if (expanded) R.string.viewer_caption_see_less_hint else R.string.viewer_caption_see_more_hint)
            Text(
                text = stringResource(if (expanded) R.string.viewer_caption_see_less else R.string.viewer_caption_see_more),
                color = MeeshyPalette.White,
                fontWeight = FontWeight.SemiBold,
                style = MaterialTheme.typography.bodyMedium.copy(shadow = CAPTION_SHADOW),
                modifier = Modifier
                    .clickable(onClickLabel = hint, role = Role.Button) { expanded = !expanded }
                    .padding(vertical = MeeshySpacing.sm),
            )
        }
    }
}

/**
 * La pellicule de la série — miroir de `ConversationMediaFilmstrip` : la vignette active bordée
 * de blanc, un toucher saute à la pièce, et chaque vignette dit sa position (« Média 2 sur 7 »).
 * Absente pour une pièce seule.
 */
@Composable
internal fun ImageViewerFilmstrip(
    thumbnails: List<String>,
    current: Int,
    onSelect: (Int) -> Unit,
    modifier: Modifier = Modifier,
) {
    if (thumbnails.size < 2) return
    val listState = rememberLazyListState()
    LaunchedEffect(current) {
        listState.animateScrollToItem((current - 2).coerceAtLeast(0))
    }
    LazyRow(
        state = listState,
        modifier = modifier
            .fillMaxWidth()
            .padding(top = FILMSTRIP_VERTICAL, bottom = FILMSTRIP_VERTICAL + FILMSTRIP_BOTTOM),
        contentPadding = PaddingValues(horizontal = FILMSTRIP_EDGE),
        horizontalArrangement = Arrangement.spacedBy(FILMSTRIP_SPACING),
    ) {
        itemsIndexed(thumbnails) { index, thumbnail ->
            val isCurrent = index == current
            val position = stringResource(R.string.viewer_position, index + 1, thumbnails.size)
            val shape = RoundedCornerShape(MeeshyRadius.sm)
            AsyncImage(
                model = thumbnail,
                contentDescription = null,
                contentScale = ContentScale.Crop,
                modifier = Modifier
                    .size(FILMSTRIP_ITEM)
                    .clip(shape)
                    .background(MeeshyPalette.White.copy(alpha = 0.08f))
                    .border(
                        width = if (isCurrent) 2.dp else 1.dp,
                        color = MeeshyPalette.White.copy(alpha = if (isCurrent) 1f else 0.3f),
                        shape = shape,
                    )
                    .clickable { onSelect(index) }
                    .semantics {
                        contentDescription = position
                        role = Role.Button
                        selected = isCurrent
                        onClick(label = position) {
                            onSelect(index)
                            true
                        }
                    },
            )
        }
    }
}

/**
 * Un média introuvable a un état DESSINÉ — miroir de `GalleryMediaUnavailableView` :
 * pictogramme, phrase, et « Réessayer » quand une nouvelle tentative a un sens.
 */
@Composable
internal fun MediaUnavailableState(onRetry: (() -> Unit)?) {
    Column(
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(MeeshySpacing.mdPlus),
        modifier = Modifier.padding(MeeshySpacing.xxl),
    ) {
        Icon(
            imageVector = Icons.Outlined.BrokenImage,
            contentDescription = null,
            tint = MeeshyPalette.White.copy(alpha = 0.7f),
            modifier = Modifier.size(48.dp),
        )
        Text(
            text = stringResource(R.string.viewer_media_unavailable),
            style = MaterialTheme.typography.bodyMedium,
            color = MeeshyPalette.White.copy(alpha = 0.8f),
        )
        if (onRetry != null) {
            Text(
                text = stringResource(R.string.viewer_retry),
                style = MaterialTheme.typography.bodyMedium,
                fontWeight = FontWeight.SemiBold,
                color = MeeshyPalette.White,
                modifier = Modifier
                    .clip(CircleShape)
                    .background(MeeshyPalette.White.copy(alpha = 0.15f))
                    .clickable(role = Role.Button, onClick = onRetry)
                    .heightIn(min = FullscreenChromeDimens.tapTarget)
                    .padding(horizontal = MeeshySpacing.lg, vertical = MeeshySpacing.md),
            )
        }
    }
}
