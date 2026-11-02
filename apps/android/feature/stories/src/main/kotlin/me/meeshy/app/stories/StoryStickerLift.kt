package me.meeshy.app.stories

import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.produceState
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.platform.LocalContext
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.launch

/**
 * « Faire un sticker » d'une IMAGE posée (#13847, entrée du « Modifier », #13973) : son sujet est détouré sur l'appareil,
 * gardé dans Mes stickers et posé sur la scène. `null` quand le détourage n'est pas servi ici, et pour tout ce qui n'est pas
 * une image arrivée (vidéo, envoi en attente) — loi 4 : une porte sans effet n'existe pas.
 */
@Composable
internal fun rememberStickerLift(state: StoryComposerUiState, mediaId: String?, viewModel: StoryComposerViewModel): (() -> Unit)? {
    val file = mediaId?.let(state.deck.selectedSlide::mediaFileOf)
    val image = state.attachments.firstOrNull { it.id == file && it.mimeType.startsWith("image/") } ?: return null
    return LocalStickerLift.current.lift(image.url, viewModel)
}

/** Qui détoure : l'appareil par défaut ; un témoin le remplace sans monter le graphe d'injection. */
internal class StickerLiftSource(val lift: @Composable (url: String, viewModel: StoryComposerViewModel) -> (() -> Unit)?)

internal val LocalStickerLift = staticCompositionLocalOf { StickerLiftSource { url, viewModel -> rememberDeviceStickerLift(url, viewModel) } }

@Composable
private fun rememberDeviceStickerLift(url: String, viewModel: StoryComposerViewModel): (() -> Unit)? {
    val kit = rememberStoryStickerKit()
    val served by produceState(false, kit) { value = kit.images.isLiftServed() }
    val context = LocalContext.current
    if (!served) return null
    return {
        viewModel.viewModelScope.launch {
            val outcome = kit.images.liftIntoLibrary(ComposerMediaAddress.of(url, viewModel.mediaBaseUrl))
            context.sayLift(outcome)
            if (outcome is StickerLiftOutcome.Saved) kit.images.libraryPose(outcome.item.id)?.let(viewModel::onAddImageSticker)
        }
    }
}
