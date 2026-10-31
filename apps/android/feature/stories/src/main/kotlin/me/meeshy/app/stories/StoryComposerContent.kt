package me.meeshy.app.stories

import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import me.meeshy.sdk.media.MediaUploadItem
import me.meeshy.sdk.model.MosaicLayoutMode
import me.meeshy.sdk.model.ReelComposition
import me.meeshy.sdk.model.composer.ComposerFormat
import me.meeshy.sdk.model.composer.ComposerFormatVariant
import me.meeshy.sdk.model.composer.ComposerOpening

/**
 * The scene of the ONE composer (#13863 R1): story, post and reel are all composed here, mounted as a CONTENT of the host
 * (the ViewModel belongs to the host's back-stack entry). The host pushes the [format] it governs and the [layout] it armed;
 * a format switch changes them and nothing else — the scene stays where it is, nothing is carried. [onFacts] reports what
 * the offer breathes with (text, media, scene, scene count), and [onFormatRestored] the format of a reopened draft.
 */
@Composable
fun StoryComposerContent(
    format: ComposerFormat,
    layout: MosaicLayoutMode?,
    onFacts: (StoryComposerFacts) -> Unit,
    onClose: () -> Unit,
    /** Le menu « Publier comme » de l'hôte, rendu dans le chevron de Publier (#13834). */
    formatChevron: @Composable () -> Unit,
    /** La matière que la porte pose (partage entrant, média de conversation ou de post) : déjà jugée et copiée dans le cache privé, elle rejoint la scène par le chemin d'un média choisi. */
    seedMedia: List<MediaUploadItem> = emptyList(),
    seedText: String = "",
    seededByDoor: Boolean = false,
    onSeedApplied: () -> Unit = {},
    onFormatRestored: (ComposerFormat) -> Unit = {},
    raisePostText: Boolean = false,
    onPostTextRaised: () -> Unit = {},
    /** Ce que la porte promet au geste sur la scène vide : le viseur photo et vidéo, ou vidéo seulement (#13849). */
    opening: ComposerOpening = ComposerOpening.CAMERA_READY,
    viewModel: StoryComposerViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    LaunchedEffect(format, layout) { viewModel.onFormat(format, layout) }
    StoryComposerScreen(
        onClose = onClose,
        seededByDoor = seededByDoor,
        formatChevron = formatChevron,
        opening = opening,
        raisePostText = raisePostText,
        onPostTextRaised = onPostTextRaised,
        viewModel = viewModel,
    )
    LaunchedEffect(seedMedia) {
        if (seedMedia.isEmpty()) return@LaunchedEffect
        viewModel.onMediaPicked(seedMedia)
        onSeedApplied()
    }
    // The host's text is the latest the author typed, under any format (the mood included); an empty one, or the scene's own
    // words handed back after a rotation, never clobbers what the scene holds.
    LaunchedEffect(Unit) {
        val writesPostText = ComposerFormatVariant.of(format).writesPostText
        val own = if (writesPostText) state.postText else state.editorText
        if (seedText.isBlank() || seedText == own) return@LaunchedEffect
        if (writesPostText) viewModel.onPostTextChange(seedText) else viewModel.onTextChange(seedText)
    }
    LaunchedEffect(state.restoredFormat) {
        val restored = state.restoredFormat ?: return@LaunchedEffect
        onFormatRestored(restored)
        viewModel.onFormatRestoredApplied()
    }
    val facts = StoryComposerFacts(
        text = if (state.variant.writesPostText) state.postText else state.editorText,
        hasScene = state.postSceneSlides.isNotEmpty(),
        media = state.sceneMediaKinds(),
        sceneCount = state.postSceneSlides.size,
    )
    LaunchedEffect(facts) { onFacts(facts) }
}

/** What the host needs to know about the scene: its text, whether it exists, its media and how many scenes it holds. */
data class StoryComposerFacts(
    val text: String,
    val hasScene: Boolean,
    val media: List<ReelComposition.MediaKind>,
    val sceneCount: Int,
)
