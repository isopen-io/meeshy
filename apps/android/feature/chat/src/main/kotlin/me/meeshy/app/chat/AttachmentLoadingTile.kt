package me.meeshy.app.chat

import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.CustomAccessibilityAction
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.customActions
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil.compose.AsyncImage
import java.io.File
import me.meeshy.feature.chat.R
import me.meeshy.sdk.model.composer.PendingAttachmentType
import me.meeshy.sdk.model.media.PreparationStage
import me.meeshy.sdk.model.media.PreparationStageLabel
import me.meeshy.sdk.model.media.PreparingAttachment
import me.meeshy.sdk.model.media.label
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.icons.MeeshyIcons

internal val LoadingTileSide = 56.dp
internal val LoadingTileRadius = 10.dp
private val CancelDiameter = 18.dp
private const val VEIL_ALPHA = 0.12f

/** Le libellé terse de l'étape, tenu dans la tuile de 56 dp (iOS `stageLabel`). */
internal fun PreparationStageLabel.labelRes(): Int = when (this) {
    PreparationStageLabel.LOADING -> R.string.attachment_stage_loading
    PreparationStageLabel.COMPRESSING -> R.string.attachment_stage_compressing
    PreparationStageLabel.PREVIEW -> R.string.attachment_stage_thumbnailing
    PreparationStageLabel.FINGERPRINT -> R.string.attachment_stage_hashing
}

private fun PendingAttachmentType.kindLabelRes(): Int = when (this) {
    PendingAttachmentType.IMAGE -> R.string.composer_tray_type_image
    PendingAttachmentType.VIDEO -> R.string.composer_tray_type_video
    PendingAttachmentType.AUDIO -> R.string.composer_tray_type_audio
    PendingAttachmentType.FILE -> R.string.composer_tray_type_file
}

/**
 * La tuile d'une pièce en préparation — miroir d'`AttachmentLoadingTile` iOS. Elle occupe d'emblée sa place
 * finale (56 dp, rayon 10) : le passage à prête ne déplace aucune autre tuile. Miniature assombrie de 12 %
 * tant qu'elle prépare, sinon la couleur d'accent qui scintille ; spinner en coin une fois la miniature là,
 * sinon grand spinner et étape ; échec rouge « Erreur » avec réessayer.
 *
 * TalkBack : UN nœud, libellé = type, valeur = étape (zone live polie), action Annuler.
 */
@Composable
internal fun AttachmentLoadingTile(
    item: PreparingAttachment,
    accent: Color,
    onCancel: () -> Unit,
    onRetry: () -> Unit,
    onHaptic: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val kind = stringResource(item.type.kindLabelRes())
    val stage = item.stage
    val failed = stage as? PreparationStage.Failed
    val value = failed?.let { stringResource(R.string.attachment_loading_a11y_failed) + ": " + it.message }
        ?: stage.label()?.let { stringResource(it.labelRes()) }
        ?: stringResource(R.string.attachment_loading_a11y_ready)
    val cancelLabel = stringResource(R.string.attachment_loading_cancel_a11y)
    val shape = RoundedCornerShape(LoadingTileRadius)
    Box(
        modifier = modifier
            .size(LoadingTileSide)
            .semantics(mergeDescendants = false) {
                contentDescription = kind
                stateDescription = value
                liveRegion = LiveRegionMode.Polite
                customActions = listOf(CustomAccessibilityAction(cancelLabel) { onHaptic(); onCancel(); true })
            },
    ) {
        Box(
            modifier = Modifier
                .size(LoadingTileSide)
                .clip(shape)
                .then(if (failed != null) Modifier.clickable { onRetry() } else Modifier)
                .clearAndSetSemantics { },
            contentAlignment = Alignment.Center,
        ) {
            TileBackground(item, accent)
            when {
                failed != null -> FailureOverlay()
                item.hasThumbnail -> CornerSpinner()
                else -> StageSpinner(stage)
            }
        }
        CancelButton(onClick = { onHaptic(); onCancel() }, label = cancelLabel, modifier = Modifier.align(Alignment.TopEnd))
    }
}

@Composable
private fun TileBackground(item: PreparingAttachment, accent: Color) {
    val thumbnail = item.prepared.thumbnailPath
    if (thumbnail != null) {
        Box(Modifier.fillMaxSize()) {
            AsyncImage(
                model = File(thumbnail),
                contentDescription = null,
                contentScale = ContentScale.Crop,
                modifier = Modifier.fillMaxSize(),
            )
            Box(Modifier.fillMaxSize().background(Color.Black.copy(alpha = VEIL_ALPHA)))
        }
        return
    }
    val pulse by rememberInfiniteTransition(label = "tile-shimmer").animateFloat(
        initialValue = 0.55f,
        targetValue = 1f,
        animationSpec = infiniteRepeatable(tween(durationMillis = 900, easing = LinearEasing), RepeatMode.Reverse),
        label = "tile-shimmer-alpha",
    )
    Box(Modifier.fillMaxSize().alpha(pulse).background(accent))
}

@Composable
private fun CornerSpinner() {
    Box(Modifier.fillMaxSize().padding(4.dp), contentAlignment = Alignment.BottomStart) {
        Box(Modifier.size(18.dp).clip(CircleShape).background(Color.Black.copy(alpha = 0.4f)), contentAlignment = Alignment.Center) {
            CircularProgressIndicator(modifier = Modifier.size(12.dp), strokeWidth = 1.5.dp, color = Color.White)
        }
    }
}

@Composable
private fun StageSpinner(stage: PreparationStage) {
    Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(2.dp)) {
        CircularProgressIndicator(modifier = Modifier.size(20.dp), strokeWidth = 2.dp, color = Color.White)
        stage.label()?.let {
            Text(
                text = stringResource(it.labelRes()),
                color = Color.White,
                fontSize = 8.sp,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.padding(horizontal = 4.dp),
            )
        }
    }
}

@Composable
private fun FailureOverlay() {
    Column(
        modifier = Modifier.fillMaxSize().background(MeeshyPalette.Error.copy(alpha = 0.85f)),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        Icon(MeeshyIcons.WarningFilled, contentDescription = null, tint = Color.White, modifier = Modifier.size(16.dp))
        Text(stringResource(R.string.attachment_loading_error), color = Color.White, fontSize = 8.sp)
    }
}

@Composable
private fun CancelButton(onClick: () -> Unit, label: String, modifier: Modifier = Modifier) {
    Box(
        modifier = modifier
            .offset(x = 5.dp, y = (-5).dp)
            .size(CancelDiameter)
            .clip(CircleShape)
            .background(MeeshyPalette.Error)
            .clickable(onClickLabel = label, onClick = onClick)
            .clearAndSetSemantics { },
        contentAlignment = Alignment.Center,
    ) {
        Icon(MeeshyIcons.Close, contentDescription = null, tint = Color.White, modifier = Modifier.size(10.dp))
    }
}
