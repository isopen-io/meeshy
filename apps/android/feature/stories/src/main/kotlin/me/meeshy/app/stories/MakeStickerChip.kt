package me.meeshy.app.stories

import androidx.compose.foundation.layout.heightIn
import androidx.compose.material3.AssistChip
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.produceState
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.launch
import me.meeshy.feature.stories.R
import me.meeshy.ui.icons.MeeshyIcons

/**
 * « Faire un sticker » dans le Modifier d'une IMAGE posée (#13847) : son sujet est détouré sur l'appareil, gardé dans
 * Mes stickers et posé sur la scène. Absent quand le détourage n'est pas servi ici, et pour tout ce qui n'est pas une
 * image arrivée (vidéo, envoi en attente) — loi 4 : une porte sans effet n'existe pas.
 */
@Composable
internal fun MakeStickerChip(state: StoryComposerUiState, mediaId: String, viewModel: StoryComposerViewModel) {
    val image = state.attachments.firstOrNull { it.id == mediaId && it.mimeType.startsWith("image/") } ?: return
    val kit = rememberStoryStickerKit()
    val served by produceState(false, kit) { value = kit.images.isLiftServed() }
    if (!served) return
    val context = LocalContext.current
    AssistChip(
        onClick = {
            viewModel.viewModelScope.launch {
                val outcome = kit.images.liftIntoLibrary(ComposerMediaAddress.of(image.url, viewModel.mediaBaseUrl))
                context.sayLift(outcome)
                if (outcome is StickerLiftOutcome.Saved) kit.images.libraryPose(outcome.item.id)?.let(viewModel::onAddImageSticker)
            }
        },
        label = { Text(stringResource(R.string.story_sticker_make)) },
        leadingIcon = { Icon(MeeshyIcons.Cut, contentDescription = null) },
        modifier = Modifier.heightIn(min = 48.dp),
    )
}
