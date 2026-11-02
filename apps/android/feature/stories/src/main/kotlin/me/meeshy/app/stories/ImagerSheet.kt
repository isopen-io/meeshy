package me.meeshy.app.stories

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.requiredSize
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilledTonalButton
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.scale
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import me.meeshy.feature.stories.R
import me.meeshy.sdk.model.composer.scene.SceneExportDestination
import me.meeshy.sdk.model.scene.export.ImagerDecision
import me.meeshy.sdk.model.scene.export.ImagerOffer
import me.meeshy.sdk.model.scene.export.ImagerQuarter
import me.meeshy.sdk.model.scene.export.StoryExportVideoFormat
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

/**
 * **LA VUE IMAGER** (#14326) — la même pour une story, un post à scène, un réel : « Imager » l'ouvre au geste, jamais un rendu
 * direct. Elle montre la composition, se prépare tant que sa durée n'est pas mesurée, propose au-delà d'une minute la part
 * rendue depuis le début (1/4 · 2/4 · 3/4 · 4/4, le tout présélectionné), puis Enregistrer ou Partager. La fermer renonce.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
internal fun ImagerSheet(offer: ImagerOffer?, scene: StorySlideView?, onDecide: (ImagerDecision?) -> Unit) {
    ModalBottomSheet(
        onDismissRequest = { onDecide(null) },
        sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true),
        containerColor = MeeshyTheme.tokens.backgroundPrimary,
    ) {
        ImagerSheetContent(offer, preview = { scene?.let { ImagerScenePreview(it) } }, onDecide = onDecide)
    }
}

@Composable
internal fun ImagerSheetContent(offer: ImagerOffer?, preview: @Composable () -> Unit, onDecide: (ImagerDecision?) -> Unit) {
    val tokens = MeeshyTheme.tokens
    var quarter by remember(offer) { mutableStateOf(offer?.preselected) }
    Column(
        Modifier.fillMaxWidth().verticalScroll(rememberScrollState()).navigationBarsPadding()
            .padding(horizontal = MeeshySpacing.md).padding(bottom = MeeshySpacing.md),
        verticalArrangement = Arrangement.spacedBy(MeeshySpacing.md),
    ) {
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            IconButton(onClick = { onDecide(null) }) {
                Icon(MeeshyIcons.Close, contentDescription = stringResource(R.string.stories_imager_close), tint = tokens.textPrimary)
            }
            Text(
                stringResource(R.string.stories_viewer_export_imager),
                color = tokens.textPrimary,
                style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.SemiBold),
                modifier = Modifier.padding(horizontal = MeeshySpacing.sm),
            )
        }
        Box(
            Modifier.align(Alignment.CenterHorizontally).fillMaxWidth(PREVIEW_WIDTH_FRACTION).aspectRatio(PREVIEW_ASPECT)
                .clip(RoundedCornerShape(PREVIEW_CORNER)),
        ) { preview() }
        ImagerLengthSection(offer, quarter, onQuarter = { quarter = it })
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.sm)) {
            FilledTonalButton(
                onClick = { onDecide(ImagerDecision(SceneExportDestination.GALLERY, quarter)) },
                enabled = offer != null,
                modifier = Modifier.weight(1f),
            ) {
                Icon(MeeshyIcons.Download, contentDescription = null, modifier = Modifier.size(ICON_SIZE))
                Text(stringResource(R.string.stories_imager_save), modifier = Modifier.padding(start = MeeshySpacing.xs))
            }
            Button(
                onClick = { onDecide(ImagerDecision(SceneExportDestination.SHARE, quarter)) },
                enabled = offer != null,
                modifier = Modifier.weight(1f),
            ) {
                Icon(MeeshyIcons.Share, contentDescription = null, modifier = Modifier.size(ICON_SIZE))
                Text(stringResource(R.string.stories_imager_share), modifier = Modifier.padding(start = MeeshySpacing.xs))
            }
        }
    }
}

@OptIn(androidx.compose.foundation.layout.ExperimentalLayoutApi::class)
@Composable
private fun ImagerLengthSection(offer: ImagerOffer?, quarter: ImagerQuarter?, onQuarter: (ImagerQuarter) -> Unit) {
    val tokens = MeeshyTheme.tokens
    when {
        offer == null -> Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.sm)) {
            CircularProgressIndicator(Modifier.size(ICON_SIZE), strokeWidth = 2.dp)
            Text(stringResource(R.string.stories_imager_preparing), color = tokens.textSecondary, style = MaterialTheme.typography.bodyMedium)
        }
        offer.choices.isEmpty() -> Text(
            stringResource(R.string.stories_imager_duration, StoryVideoExportStages.clock(offer.totalMillis)),
            color = tokens.textSecondary,
            style = MaterialTheme.typography.bodyMedium,
        )
        else -> Column(verticalArrangement = Arrangement.spacedBy(MeeshySpacing.xs)) {
            Text(stringResource(R.string.stories_export_length_title), color = tokens.textPrimary, style = MaterialTheme.typography.titleSmall)
            Text(stringResource(R.string.stories_export_length_subtitle), color = tokens.textSecondary, style = MaterialTheme.typography.bodySmall)
            FlowRow(horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.sm)) {
                offer.choices.forEach { choice ->
                    FilterChip(
                        selected = choice.quarter == quarter,
                        onClick = { onQuarter(choice.quarter) },
                        label = {
                            Text(stringResource(R.string.stories_export_length_option, choice.quarter.numerator, StoryVideoExportStages.clock(choice.durationMillis)))
                        },
                    )
                }
            }
        }
    }
}

/**
 * La composition telle qu'elle partira : sa première scène, au repos, muette, et sa légende gravée comme l'export la grave
 * (#14346) — posée à la taille de la vidéo puis réduite à celle de l'aperçu, pour que ce qu'on voit soit ce qu'on enregistre.
 */
@Composable
internal fun ImagerScenePreview(scene: StorySlideView) {
    BoxWithConstraints(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
        StoryScenePlayer(slide = scene, playing = false, muted = true, loads = true, rewindWhenIdle = true, resting = true)
        if (scene.text.isNotBlank()) {
            val density = LocalDensity.current
            val format = remember { StoryExportVideoFormat.of() }
            val exportWidth = with(density) { format.width.toDp() }
            val exportHeight = with(density) { format.height.toDp() }
            Box(Modifier.requiredSize(exportWidth, exportHeight).scale(maxWidth / exportWidth)) {
                StoryExportCaption(scene.text, Modifier.align(Alignment.BottomStart))
            }
        }
    }
}

private const val PREVIEW_WIDTH_FRACTION = 0.55f
private const val PREVIEW_ASPECT = 9f / 16f
private val PREVIEW_CORNER = 16.dp
private val ICON_SIZE = 18.dp
