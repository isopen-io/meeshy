package me.meeshy.app.chat.export

import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Slider
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.text.font.FontWeight
import kotlinx.coroutines.launch
import me.meeshy.feature.chat.R
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

/**
 * LE FOND CHOISI (#18672, miroir de `MessageCardBackdropPicker`) — une photo ou une vidéo de la galerie, peinte sous un
 * voile de la couleur de la palette. Une vidéo y pose sa première image.
 */
@Composable
internal fun CardBackdropRow(state: CardExportState, onHaptic: () -> Unit) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val picker = rememberLauncherForActivityResult(ActivityResultContracts.PickVisualMedia()) { uri ->
        if (uri == null) return@rememberLauncherForActivityResult
        val kind = if (context.contentResolver.getType(uri)?.startsWith("video/") == true) CardMediaKind.VIDEO else CardMediaKind.IMAGE
        val media = CardMedia(id = CardBackdrop.MEDIA_ID, kind = kind, url = uri.toString())
        scope.launch {
            val picture = CardPictureLoader.load(context, listOf(media))[CardBackdrop.MEDIA_ID]
            if (picture == null) {
                state.backdropFailed = true
                return@launch
            }
            state.backdropFailed = false
            state.backdropPicture = picture
            state.backdrop = CardBackdrop(media, state.backdrop?.veil ?: CardBackdrop.DEFAULT_VEIL)
        }
    }
    val chosen = state.backdrop
    Column(Modifier.fillMaxWidth().padding(horizontal = MeeshySpacing.lg), verticalArrangement = Arrangement.spacedBy(MeeshySpacing.xs)) {
        Row(horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.sm), verticalAlignment = Alignment.CenterVertically) {
            CardPill(
                stringResource(if (chosen == null) R.string.export_card_backdrop_pick else R.string.export_card_backdrop_change),
                selected = false,
                onClick = { onHaptic(); picker.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageAndVideo)) },
            )
            if (chosen != null) {
                CardPill(stringResource(R.string.export_card_backdrop_remove), selected = false, onClick = {
                    onHaptic()
                    state.backdrop = null
                    state.backdropPicture = null
                })
            }
        }
        if (state.backdropFailed) {
            Text(stringResource(R.string.export_card_backdrop_failed), color = MeeshyTheme.tokens.textSecondary, style = MaterialTheme.typography.bodySmall)
        }
        if (chosen != null) {
            val veil = stringResource(R.string.export_card_backdrop_veil)
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.sm)) {
                Text(veil, color = MeeshyTheme.tokens.textPrimary, style = MaterialTheme.typography.labelLarge)
                Slider(
                    value = chosen.veil.toFloat(),
                    onValueChange = { state.backdrop = CardBackdrop(chosen.media, it.toDouble()) },
                    valueRange = 0f..CardBackdrop.MAX_VEIL.toFloat(),
                    modifier = Modifier.weight(1f).semantics { contentDescription = veil },
                )
            }
        }
    }
}

/**
 * IMAGE OU VIDÉO QUI DÉFILE (#18671, miroir de `MessageCardScrollSpeedRow`) — offert seulement quand la carte dépasse son
 * format : neuf vitesses, de ×0,5 à ×3, et la durée qu'elles donnent, vue avant d'enregistrer.
 */
@Composable
internal fun CardVideoRow(state: CardExportState, onHaptic: () -> Unit) {
    val plan = state.scrollPlan ?: return
    val tokens = MeeshyTheme.tokens
    Column(Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(MeeshySpacing.xs)) {
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.sm)) {
            Text(stringResource(R.string.export_card_output_label), color = tokens.textSecondary, style = MaterialTheme.typography.labelLarge)
            CardPill(stringResource(R.string.export_card_output_image), !state.video, { onHaptic(); state.video = false })
            CardPill(stringResource(R.string.export_card_output_video), state.video, { onHaptic(); state.video = true })
        }
        if (!state.video) return@Column
        val durationLabel = stringResource(R.string.export_card_scroll_duration)
        val duration = CardScrollPlan.durationLabel(plan.duration)
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            Text(stringResource(R.string.export_card_scroll_title), color = tokens.textPrimary, style = MaterialTheme.typography.labelLarge.copy(fontWeight = FontWeight.SemiBold))
            Spacer(Modifier.weight(1f))
            Text(
                duration, color = tokens.textSecondary, style = MaterialTheme.typography.labelLarge,
                modifier = Modifier.semantics { contentDescription = durationLabel; stateDescription = duration },
            )
        }
        val speedLabel = stringResource(R.string.export_card_scroll_speed)
        Row(
            Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()).semantics { contentDescription = speedLabel },
            horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.xs),
        ) {
            CardScrollSpeed.entries.forEach { item ->
                CardPill(item.label(), item == state.speed, { onHaptic(); state.speed = item })
            }
        }
        state.progress?.let { done ->
            LinearProgressIndicator(progress = { done.toFloat() }, modifier = Modifier.fillMaxWidth().padding(top = MeeshySpacing.xs))
        }
    }
}
