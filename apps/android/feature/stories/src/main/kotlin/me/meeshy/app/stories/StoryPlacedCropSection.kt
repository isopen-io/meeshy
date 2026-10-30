package me.meeshy.app.stories

import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import coil.compose.AsyncImage
import me.meeshy.feature.stories.R
import me.meeshy.sdk.model.StoryMediaCrop
import me.meeshy.sdk.model.composer.look.ComposerCropPreset
import me.meeshy.sdk.model.composer.look.ComposerLookCanvas
import me.meeshy.ui.component.retouch.RetouchCropBrackets
import me.meeshy.ui.theme.MeeshySpacing

/**
 * **Recadrer l'image posée** (#13849, iOS `StoryMediaObject.crop`) : les proportions (« Original », 9:16, 4:5, 1:1, 16:9),
 * puis l'image ENTIÈRE avec ses équerres. Le cadre s'écrit en `MediaCropRect` sur le média posé — l'image n'est jamais
 * réécrite — et chaque image du geste ne compte qu'un cran d'historique.
 */
@Composable
internal fun PlacedCropSection(state: StoryComposerUiState, mediaId: String, viewModel: StoryComposerViewModel) {
    val (width, height) = state.placedSourceSizeOf(mediaId) ?: return
    val media = state.attachments.firstOrNull { it.id == mediaId } ?: return
    val crop = state.deck.selectedSlide.placedMedia.firstOrNull { it.mediaId == mediaId }?.crop
    val chosen = state.placedCropPresetOf(mediaId)
    val aspect = chosen?.takeUnless { it == ComposerCropPreset.ORIGINAL }?.aspect(width, height)
    Column(verticalArrangement = Arrangement.spacedBy(MeeshySpacing.sm)) {
        Row(
            modifier = Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()),
            horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.sm),
        ) {
            ComposerCropPreset.entries.forEach { preset ->
                FilterChip(
                    selected = preset == chosen,
                    onClick = { viewModel.onSceneReduce { StoryComposerPlacedMediaReducer.preset(it, mediaId, preset) } },
                    label = { Text(preset.notation ?: stringResource(me.meeshy.ui.R.string.retouch_crop_original)) },
                    modifier = Modifier.heightIn(min = 48.dp),
                )
            }
        }
        BoxWithConstraints(Modifier.fillMaxWidth().height(CROP_STAGE_HEIGHT).testTag("placed-crop-stage")) {
            AsyncImage(
                model = ComposerMediaAddress.of(media.url, viewModel.mediaBaseUrl),
                contentDescription = stringResource(R.string.composer_column_media_crop),
                contentScale = ContentScale.Fit,
                modifier = Modifier.fillMaxSize(),
            )
            val display = with(LocalDensity.current) {
                ComposerLookCanvas.displayRect(maxWidth.toPx(), maxHeight.toPx(), width.toInt(), height.toInt())
            }
            RetouchCropBrackets(crop = crop?.normalized, aspect = aspect, display = display) { next ->
                viewModel.onSceneGesture("crop-$mediaId") { StoryComposerPlacedMediaReducer.cropped(it, mediaId, StoryMediaCrop.ofNormalized(next)) }
            }
        }
    }
}

private val CROP_STAGE_HEIGHT = 220.dp
