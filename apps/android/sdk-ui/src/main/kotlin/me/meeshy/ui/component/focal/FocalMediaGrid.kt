package me.meeshy.ui.component.focal

import android.os.Build
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.Immutable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import me.meeshy.ui.component.bubble.BlurVeil
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.draw.blur
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.delay
import me.meeshy.sdk.model.BlurRevealLifecycle
import me.meeshy.sdk.model.media.formatMediaDuration
import me.meeshy.sdk.model.reading.focal.AttachmentReactionOffer
import me.meeshy.sdk.model.reading.focal.FocalCellLabel
import me.meeshy.sdk.model.reading.focal.FocalCellMediaLayer
import me.meeshy.sdk.model.reading.focal.FocalCellTap
import me.meeshy.sdk.model.reading.focal.FocalCellVeil
import me.meeshy.sdk.model.reading.focal.FocalMediaGridLayout
import me.meeshy.sdk.model.reading.focal.FocalMetrics
import me.meeshy.sdk.model.reading.focal.FocalMediaProtection
import me.meeshy.sdk.model.reading.focal.FocalMediaProtectionState
import me.meeshy.sdk.model.reading.focal.FocalMediaSlot
import me.meeshy.sdk.model.reading.focal.FocalProtectedMedia
import me.meeshy.ui.R
import me.meeshy.ui.component.bubble.BubbleCallbacks
import me.meeshy.ui.component.bubble.BubbleContent
import me.meeshy.ui.component.bubble.BubbleFile
import me.meeshy.ui.component.bubble.BubbleImage
import me.meeshy.ui.component.bubble.BubblePolicyImage
import me.meeshy.ui.component.bubble.BubbleVideo
import me.meeshy.ui.component.bubble.VideoPoster
import me.meeshy.ui.component.bubble.bubbleImageContentDescription
import me.meeshy.ui.component.bubble.bubbleVideoRatio
import me.meeshy.ui.component.bubble.opensOnTap
import me.meeshy.ui.haptics.rememberMeeshyHaptics
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.theme.MeeshySpacing

/** Une case de la grille : une photo (son rang parmi les photos, pour l'ouverture) ou une vidéo (sa pièce de fichier). */
@Immutable
internal sealed interface FocalVisual {
    val attachmentId: String
    val media: FocalProtectedMedia

    data class Photo(val image: BubbleImage, val imageIndex: Int) : FocalVisual {
        override val attachmentId: String get() = image.attachmentId
        override val media: FocalProtectedMedia
            get() = FocalProtectedMedia(image.isBlurred, image.isViewOnce, image.viewOnceCount)
    }

    data class Clip(val video: BubbleVideo, val file: BubbleFile?) : FocalVisual {
        override val attachmentId: String get() = video.attachmentId
        override val media: FocalProtectedMedia
            get() = FocalProtectedMedia(video.isBlurred, video.isViewOnce, video.viewOnceCount)
    }
}

/** Photos puis vidéos jointes à une seule grille (iOS `visualGrid`). */
internal fun focalVisuals(content: BubbleContent): List<FocalVisual> =
    content.images.mapIndexed { index, image -> FocalVisual.Photo(image, index) } +
        content.videos.map { video -> FocalVisual.Clip(video, content.files.firstOrNull { it.attachmentId == video.attachmentId }) }

private val CellSpacing = FocalMediaGridLayout.GRID_SPACING.dp
private const val GROUP_HEIGHT = 240f

/** Les cotes de chaque case (dp) pour [count] visuels dans [maxWidth] : la table de la loi, hauteurs de groupe réparties. */
internal fun focalCellSizes(count: Int, maxWidth: Float, soloVideoRatio: Float?): List<FocalMediaSlot> {
    val slots = if (count == 1 && soloVideoRatio != null) {
        listOf(FocalMediaGridLayout.soloVideoSlot(soloVideoRatio, maxWidth))
    } else {
        FocalMediaGridLayout.slots(count, maxWidth)
    }
    val half = (GROUP_HEIGHT - FocalMediaGridLayout.GRID_SPACING) / 2
    return when {
        count == 3 -> slots.mapIndexed { i, s -> if (i == 0) s else s.copy(height = half) }
        count >= 4 -> slots.map { it.copy(height = half) }
        else -> slots
    }
}

/**
 * La grille visuelle de la rangée plate (iOS `FocalMediaGrid`) : 1 média 300 × 240 (une vidéo suit son format), 2
 * médias côte à côte, 3 médias 60/40, 4+ en 2 × 2 avec « +N » sur la quatrième case. Largeur 300 au plus, réduite par
 * la colonne ; espacement 2, rayon 16.
 */
@Composable
internal fun FocalMediaGrid(
    visuals: List<FocalVisual>,
    callbacks: BubbleCallbacks,
    modifier: Modifier = Modifier,
) {
    if (visuals.isEmpty()) return
    BoxWithConstraints(modifier) {
        val width = minOf(FocalMediaGridLayout.GRID_MAX_WIDTH, maxWidth.value.takeIf { it.isFinite() } ?: FocalMediaGridLayout.GRID_MAX_WIDTH)
        val solo = (visuals.singleOrNull() as? FocalVisual.Clip)?.let { bubbleVideoRatio(it.video).toFloat() }
        val sizes = focalCellSizes(visuals.size, width, solo)
        val isSolo = visuals.size == 1
        val cell: @Composable (Int) -> Unit = { i ->
            FocalGridCell(visuals[i], sizes[i], isSolo, callbacks)
        }
        when {
            visuals.size == 1 || visuals.size == 2 -> Row(horizontalArrangement = Arrangement.spacedBy(CellSpacing)) {
                visuals.indices.forEach { cell(it) }
            }
            visuals.size == 3 -> Row(horizontalArrangement = Arrangement.spacedBy(CellSpacing)) {
                cell(0)
                Column(verticalArrangement = Arrangement.spacedBy(CellSpacing)) { cell(1); cell(2) }
            }
            else -> Column(verticalArrangement = Arrangement.spacedBy(CellSpacing)) {
                Row(horizontalArrangement = Arrangement.spacedBy(CellSpacing)) { cell(0); cell(1) }
                Row(horizontalArrangement = Arrangement.spacedBy(CellSpacing)) { cell(2); cell(3) }
            }
        }
    }
}

@OptIn(ExperimentalFoundationApi::class)
@Composable
private fun FocalGridCell(
    visual: FocalVisual,
    slot: FocalMediaSlot,
    isSolo: Boolean,
    callbacks: BubbleCallbacks,
) {
    val haptics = rememberMeeshyHaptics()
    val media = visual.media
    var isRevealed by remember(visual.attachmentId) { mutableStateOf(false) }
    val messageRevealed = LocalFocalMessageRevealed.current
    val protection = FocalMediaProtection.state(media, isRevealed, messageRevealed)
    val layer = FocalCellVeil.mediaLayer(protection, Build.VERSION.SDK_INT)
    val isProtectedMedia = media.isBlurred || media.isViewOnce

    // La révélation d'une case a une FIN : sans toucher, le flou revient après la durée de visibilité.
    LaunchedEffect(isRevealed) {
        if (isRevealed && media.isBlurred && !media.isViewOnce) {
            delay((BlurRevealLifecycle.defaultRevealDurationSeconds * 1000).toLong())
            isRevealed = false
        }
    }

    val open: (() -> Unit)? = when (visual) {
        is FocalVisual.Photo -> callbacks.onImageClick?.let { click -> { click(visual.imageIndex) } }
        is FocalVisual.Clip -> visual.file?.takeIf { it.opensOnTap }?.let { file -> callbacks.onFileClick?.let { click -> { click(file) } } }
    }
    val onTap: () -> Unit = {
        when (val action = FocalMediaProtection.tap(media, isRevealed, messageRevealed)) {
            FocalCellTap.Reveal -> {
                haptics.medium()
                isRevealed = true
            }
            is FocalCellTap.OpenFullscreen -> {
                if (protection is FocalMediaProtectionState.Blurred) haptics.medium()
                if (action.reblurs) isRevealed = false
                open?.invoke()
            }
        }
    }
    val canReact = AttachmentReactionOffer.offersReaction(isSolo, isProtected = isProtectedMedia, hasHandler = callbacks.onReactToAttachment != null)
    val onDoubleTap = callbacks.onReactToAttachment?.takeIf { canReact }
    val label = describe(visual, protection)

    Box(
        modifier = Modifier
            .size(slot.width.dp, slot.height.dp)
            .clip(RoundedCornerShape(FocalCellRadius))
            .background(Color.Black)
            .let { base ->
                if (onDoubleTap == null) {
                    // Une case ordinaire que l'hôte n'ouvre pas reste inerte ; une case voilée répond toujours.
                    if (open == null && !isProtectedMedia) base else base.clickable(onClick = onTap)
                } else {
                    // Le simple tap n'attend la désambiguïsation que sur une case qui offre réellement la réaction.
                    base.combinedClickable(
                        onClick = onTap,
                        onDoubleClick = {
                            haptics.medium()
                            onDoubleTap(visual.attachmentId)
                        },
                    )
                }
            }
            .semantics(mergeDescendants = true) {
                role = Role.Button
                contentDescription = label
            },
    ) {
        when (layer) {
            FocalCellMediaLayer.Clear -> FocalCellMedia(visual, Modifier.fillMaxSize())
            is FocalCellMediaLayer.Blurred -> FocalCellMedia(
                visual,
                Modifier
                    .fillMaxSize()
                    .blur(layer.radiusDp.dp)
                    .graphicsLayer { alpha = BlurVeil.contentAlpha(android.os.Build.VERSION.SDK_INT, concealed = true) }
                    .clearAndSetSemantics {},
            )
            FocalCellMediaLayer.Absent -> Unit
        }
        if (protection is FocalMediaProtectionState.Blurred) FocalCellVeilOverlay(protection)
        if (visual is FocalVisual.Clip && protection == FocalMediaProtectionState.None) FocalClipBadges(visual.video)
        if (FocalMediaProtection.showsViewOnceBadge(media)) FocalViewCountBadge(media.viewOnceCount, Modifier.align(Alignment.TopEnd))
        if (visual is FocalVisual.Photo && protection == FocalMediaProtectionState.None) {
            visual.image.reactionLabel?.let { FocalReactionsBadge(it, Modifier.align(Alignment.BottomStart)) }
        }
        if (slot.overflowCount > 0) FocalOverflowLabel(slot.overflowCount)
    }
}

private val FocalCellRadius: Dp = FocalMetrics.Media.RADIUS.toFloat().dp

@Composable
private fun describe(visual: FocalVisual, protection: FocalMediaProtectionState): String = when (protection) {
    is FocalMediaProtectionState.Blurred ->
        stringResource(if (protection.isViewOnce) R.string.bubble_media_a11y_view_once else R.string.bubble_media_a11y_masked)
    FocalMediaProtectionState.None -> when (visual) {
        is FocalVisual.Photo -> bubbleImageContentDescription(visual.image, stringResource(R.string.bubble_image_description))
        is FocalVisual.Clip -> stringResource(R.string.bubble_file_open)
    }
}

@Composable
private fun FocalCellMedia(visual: FocalVisual, modifier: Modifier) {
    when (visual) {
        is FocalVisual.Photo -> BubblePolicyImage(
            url = visual.image.thumbnailUrl ?: visual.image.url,
            fallbackUrl = visual.image.thumbnailUrl,
            sizeBytes = if (visual.image.thumbnailUrl != null) null else visual.image.sizeBytes,
            contentDescription = "",
            modifier = modifier,
        )
        is FocalVisual.Clip -> Box(modifier) { VideoPoster(visual.video) }
    }
}

/** Le voile d'une case protégée : l'œil barré, « Voir une fois » ou « Contenu masqué », puis « Toucher pour voir ». */
@Composable
private fun FocalCellVeilOverlay(state: FocalMediaProtectionState.Blurred) {
    val label = when (FocalCellVeil.label(state)) {
        FocalCellLabel.ViewOnce -> stringResource(R.string.bubble_blur_view_once)
        FocalCellLabel.Masked -> stringResource(R.string.bubble_media_masked)
    }
    Box(
        modifier = Modifier.fillMaxSize().background(Color.Black.copy(alpha = 0.5f)),
        contentAlignment = Alignment.Center,
    ) {
        Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(MeeshySpacing.xs)) {
            Icon(MeeshyIcons.EyeOffFilled, contentDescription = null, tint = Color.White, modifier = Modifier.size(24.dp))
            Text(label, color = Color.White, fontSize = 12.sp, fontWeight = FontWeight.SemiBold)
            Text(stringResource(R.string.bubble_media_tap_to_view), color = Color.White.copy(alpha = 0.7f), fontSize = 10.sp)
        }
    }
}

@Composable
private fun FocalClipBadges(video: BubbleVideo) {
    Box(Modifier.fillMaxSize()) {
        Icon(
            MeeshyIcons.Play,
            contentDescription = null,
            tint = Color.White,
            modifier = Modifier.align(Alignment.Center).size(44.dp).clip(CircleShape).background(Color.Black.copy(alpha = 0.55f)).padding(MeeshySpacing.sm),
        )
        formatMediaDuration(video.durationSeconds?.toDouble())?.let { duration ->
            Text(
                text = duration,
                color = Color.White,
                fontSize = 11.sp,
                modifier = Modifier.align(Alignment.TopEnd).padding(MeeshySpacing.xs)
                    .background(Color.Black.copy(alpha = 0.5f), CircleShape)
                    .padding(horizontal = MeeshySpacing.xsPlus, vertical = MeeshySpacing.xxs),
            )
        }
    }
}

@Composable
private fun FocalViewCountBadge(count: Int, modifier: Modifier) {
    Text(
        text = "👁 $count",
        color = Color.White,
        fontSize = 11.sp,
        modifier = modifier.padding(MeeshySpacing.xs)
            .background(Color.Black.copy(alpha = 0.55f), CircleShape)
            .padding(horizontal = MeeshySpacing.xsPlus, vertical = MeeshySpacing.xxs),
    )
}

@Composable
private fun FocalReactionsBadge(label: String, modifier: Modifier) {
    Text(
        text = label,
        color = Color.White,
        fontSize = 12.sp,
        fontWeight = FontWeight.SemiBold,
        maxLines = 1,
        modifier = modifier.padding(MeeshySpacing.xs)
            .background(Color.Black.copy(alpha = 0.45f), CircleShape)
            .padding(horizontal = 6.dp, vertical = 2.dp),
    )
}

@Composable
private fun FocalOverflowLabel(count: Int) {
    Box(Modifier.fillMaxSize().background(Color.Black.copy(alpha = 0.45f)), contentAlignment = Alignment.Center) {
        Text("+$count", color = Color.White, fontSize = 20.sp, fontWeight = FontWeight.Bold)
    }
}
