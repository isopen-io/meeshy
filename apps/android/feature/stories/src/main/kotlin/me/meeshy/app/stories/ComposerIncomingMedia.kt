package me.meeshy.app.stories

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.Immutable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.ProgressBarRangeInfo
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.progressBarRangeInfo
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.dp
import coil.compose.AsyncImage
import kotlin.math.roundToInt
import me.meeshy.feature.stories.R
import me.meeshy.sdk.media.MediaUploadItem
import me.meeshy.sdk.media.previewModel
import me.meeshy.sdk.model.composer.ComposerMediaRole
import me.meeshy.sdk.model.media.MediaUploadProgress
import me.meeshy.sdk.model.scene.ForegroundMediaFrame
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.theme.MeeshyRadius
import me.meeshy.ui.theme.MeeshySpacing

/**
 * L'espace réservé d'un média qui entre dans la scène (R5 de #13863) : à la place que R4 lui a donnée — [fillsScene] pour
 * le fond d'une diapo qui n'en a pas, sinon centré sur ([x], [y]), là où se posera le prochain objet —, avec [preview] (la
 * vignette locale, `null` pour une vidéo : une forme neutre), [fraction] de l'envoi (`null` : encore en préparation) et
 * [more] médias de la même sélection qui fondent leur propre diapo.
 */
@Immutable
internal data class IncomingMediaPlaceholder(
    val fillsScene: Boolean,
    val x: Double,
    val y: Double,
    val preview: Any?,
    val fraction: Float?,
    val more: Int,
)

/** L'espace réservé de la sélection en cours d'envoi, ou `null` quand rien n'entre : il part dans l'image où l'envoi s'achève. */
internal fun StoryComposerUiState.incomingPlaceholder(): IncomingMediaPlaceholder? {
    if (!isUploadingMedia) return null
    val first = mediaLandings.firstOrNull() ?: return null
    val at = deck.nextObjectPosition().takeIf { first.role == ComposerMediaRole.FOREGROUND }
    val item = incomingMedia.firstOrNull()
    return IncomingMediaPlaceholder(
        fillsScene = first.role == ComposerMediaRole.BACKGROUND && !first.newSlide,
        x = at?.x ?: CENTER,
        y = at?.y ?: CENTER,
        preview = item?.takeUnless { it.mimeType.startsWith("video", ignoreCase = true) }?.previewModel,
        fraction = incomingFraction(uploadingMedia, incomingMedia),
        more = mediaLandings.size - 1,
    )
}

/** La part envoyée de toute la sélection, chaque média pesant ses octets ; `null` tant qu'aucun n'a commencé (la préparation). */
private fun incomingFraction(lines: List<MediaUploadProgress>, items: List<MediaUploadItem>): Float? {
    if (lines.none { it is MediaUploadProgress.Uploading || it is MediaUploadProgress.Ready }) return null
    val weights = lines.indices.map { index -> items.getOrNull(index)?.sizeBytes?.takeIf { it > 0 }?.toDouble() ?: 1.0 }
    val done = lines.mapIndexed { index, line ->
        val share = when (line) {
            is MediaUploadProgress.Uploading -> line.fraction ?: 0.0
            is MediaUploadProgress.Ready -> 1.0
            else -> 0.0
        }
        share * weights[index]
    }
    return (done.sum() / weights.sum()).toFloat().coerceIn(0f, 1f)
}

private const val CENTER = 0.5

/** L'espace réservé posé sur la scène, à l'échelle de celle-ci : son aperçu, son anneau annoncé à TalkBack, et ✕ pour annuler. */
@Composable
internal fun IncomingMediaPlaceholderLayer(placeholder: IncomingMediaPlaceholder, onCancel: () -> Unit) {
    BoxWithConstraints(Modifier.fillMaxSize()) {
        if (placeholder.fillsScene) {
            IncomingMediaCard(placeholder, onCancel, Modifier.fillMaxSize())
            return@BoxWithConstraints
        }
        val widthPx = constraints.maxWidth.toFloat()
        val heightPx = constraints.maxHeight.toFloat()
        val side = ForegroundMediaFrame.renderedSize(null, scale = 1.0, canvasWidth = widthPx.toDouble())
        val sideDp = with(LocalDensity.current) { side.width.toFloat().toDp() }
        IncomingMediaCard(
            placeholder = placeholder,
            onCancel = onCancel,
            modifier = Modifier
                .offset {
                    IntOffset(
                        x = (placeholder.x * widthPx - side.width / 2).roundToInt(),
                        y = (placeholder.y * heightPx - side.height / 2).roundToInt(),
                    )
                }
                .size(sideDp),
        )
    }
}

@Composable
private fun IncomingMediaCard(placeholder: IncomingMediaPlaceholder, onCancel: () -> Unit, modifier: Modifier) {
    val label = stringResource(R.string.story_composer_incoming_a11y)
    val fraction = placeholder.fraction
    val status = fraction?.let { stringResource(R.string.story_composer_incoming_sending, (it * PERCENT).roundToInt()) }
        ?: stringResource(R.string.story_composer_incoming_preparing)
    Box(modifier.clip(RoundedCornerShape(MeeshyRadius.md)).background(NEUTRAL_SHAPE)) {
        placeholder.preview?.let { preview ->
            AsyncImage(model = preview, contentDescription = null, contentScale = ContentScale.Crop, modifier = Modifier.matchParentSize())
        }
        Box(Modifier.matchParentSize().background(PREVIEW_VEIL))
        Column(
            modifier = Modifier.align(Alignment.Center).semantics(mergeDescendants = true) {
                contentDescription = label
                stateDescription = status
                liveRegion = LiveRegionMode.Polite
                progressBarRangeInfo = fraction?.let { ProgressBarRangeInfo(it, 0f..1f) } ?: ProgressBarRangeInfo.Indeterminate
            },
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(MeeshySpacing.xs),
        ) {
            if (fraction == null) {
                CircularProgressIndicator(color = Color.White, strokeWidth = RING_STROKE, modifier = Modifier.size(RING))
            } else {
                CircularProgressIndicator(progress = { fraction }, color = Color.White, strokeWidth = RING_STROKE, modifier = Modifier.size(RING))
            }
            Text(status, color = Color.White, style = MaterialTheme.typography.labelMedium)
            if (placeholder.more > 0) {
                Text(stringResource(R.string.story_composer_incoming_more, placeholder.more), color = Color.White, style = MaterialTheme.typography.labelSmall)
            }
        }
        IncomingCancel(onCancel, Modifier.align(Alignment.TopEnd))
    }
}

/** Le ✕ de l'espace réservé : une cible de 48 dp qui annule l'ajout. */
@Composable
internal fun IncomingCancel(onCancel: () -> Unit, modifier: Modifier = Modifier) {
    IconButton(onClick = onCancel, modifier = modifier.size(TARGET)) {
        Icon(
            imageVector = MeeshyIcons.Close,
            contentDescription = stringResource(R.string.story_composer_incoming_cancel),
            tint = Color.White,
            modifier = Modifier.background(PREVIEW_VEIL, CircleShape).padding(MeeshySpacing.xxs),
        )
    }
}

/**
 * Le badge d'un média posé sur la scène qui attend sa file d'envoi (#13959) : « En attente » sans réseau, l'anneau et
 * « Envoi… » quand il repart, « Échec — Réessayer » quand son dernier essai a échoué — jamais une attente figée en ligne.
 */
@Composable
internal fun IncomingWaitingBadge(phase: PendingUploadPhase = PendingUploadPhase.OFFLINE, modifier: Modifier = Modifier) {
    Row(
        modifier = modifier
            .background(PREVIEW_VEIL, RoundedCornerShape(MeeshyRadius.sm))
            .padding(horizontal = MeeshySpacing.xs, vertical = MeeshySpacing.xxs),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.xxs),
    ) {
        when (phase) {
            PendingUploadPhase.SENDING ->
                CircularProgressIndicator(color = Color.White, strokeWidth = BADGE_STROKE, modifier = Modifier.size(BADGE_ICON))
            PendingUploadPhase.OFFLINE ->
                Icon(MeeshyIcons.Hourglass, contentDescription = null, tint = Color.White, modifier = Modifier.size(BADGE_ICON))
            PendingUploadPhase.FAILED -> Unit
        }
        val text = when (phase) {
            PendingUploadPhase.OFFLINE -> stringResource(R.string.story_composer_incoming_waiting)
            else -> phase.label()
        }
        Text(text, color = Color.White, style = MaterialTheme.typography.labelSmall)
    }
}

/** L'anneau d'un sticker dont l'image est encore en route : il se publie à son arrivée. */
@Composable
internal fun IncomingStickerRing(modifier: Modifier = Modifier) {
    val label = stringResource(R.string.story_composer_incoming_a11y)
    CircularProgressIndicator(
        color = Color.White,
        strokeWidth = RING_STROKE,
        modifier = modifier
            .size(STICKER_RING)
            .background(PREVIEW_VEIL, CircleShape)
            .semantics { contentDescription = label },
    )
}

/** La ligne discrète de l'éditeur, au bas de la scène ; [onRetry] y ajoute « Réessayer » quand un envoi a échoué. */
@Composable
internal fun SceneNoticeLine(text: String, onRetry: (() -> Unit)?) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .background(PREVIEW_VEIL, RoundedCornerShape(MeeshyRadius.sm))
            .padding(horizontal = MeeshySpacing.sm),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            text = text,
            style = MaterialTheme.typography.bodySmall,
            color = Color.White,
            modifier = Modifier
                .weight(1f)
                .padding(vertical = NOTICE_VERTICAL)
                .semantics { liveRegion = LiveRegionMode.Polite },
        )
        onRetry?.let { retry ->
            TextButton(onClick = retry) { Text(stringResource(R.string.story_composer_incoming_retry), color = Color.White) }
        }
    }
}

private const val PERCENT = 100
private val NEUTRAL_SHAPE = Color.White.copy(alpha = 0.16f)
private val PREVIEW_VEIL = Color.Black.copy(alpha = 0.38f)
private val RING = 36.dp
private val STICKER_RING = 22.dp
private val RING_STROKE = 3.dp
private val TARGET = 48.dp
private val BADGE_ICON = 14.dp
private val BADGE_STROKE = 2.dp
private val NOTICE_VERTICAL = 6.dp
