package me.meeshy.app.stories

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Shadow
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import me.meeshy.feature.stories.R
import me.meeshy.sdk.model.caption.MediaCaptionLaw
import me.meeshy.ui.component.viewer.MediaCaptionOverlay
import androidx.compose.ui.unit.Dp
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshySpacing

/** Le rail d'actions occupe la bande droite : la légende s'arrête avant lui. */
private val RAIL_CLEARANCE = 72.dp

private val CAPTION_SHADOW = Shadow(color = Color.Black.copy(alpha = 0.65f), offset = Offset(0f, 1f), blurRadius = 6f)

/**
 * La légende d'une story, posée en bas à gauche — le [MediaCaptionOverlay] partagé avec les réels :
 * ombrée plutôt qu'encadrée, repliée à 15 mots au-delà de 30, dépliée dans une fenêtre défilante dont
 * le tap hors du texte referme sans changer de story. Elle laisse la bande du rail libre et se pose
 * au-dessus du compositeur épinglé ([bottomInset]). Chaque story repart repliée.
 */
@Composable
internal fun StoryCaptionOverlay(
    text: String,
    storyId: String,
    modifier: Modifier = Modifier,
    trackedLinks: Map<String, String>? = null,
    bottomInset: Dp = 0.dp,
) {
    var expanded by rememberSaveable(storyId) { mutableStateOf(false) }
    MediaCaptionOverlay(
        caption = text,
        expanded = expanded,
        onToggle = { expanded = !expanded },
        modifier = modifier,
        trackedLinks = trackedLinks,
        endInset = RAIL_CLEARANCE,
        bottomInset = bottomInset,
        dimsBackgroundWhenExpanded = false,
    )
}

/**
 * La légende telle que la vidéo exportée la grave (#13897) : posée comme le lecteur l'OUVRE — repliée au-delà de trente
 * mots, ombrée, en bas à gauche — mais sans « voir plus », qu'aucune vidéo ne peut toucher, ni les encarts du système, ni
 * la bande du rail, absent de la vidéo.
 */
@Composable
internal fun StoryExportCaption(text: String, modifier: Modifier = Modifier) {
    val folded = remember(text) { MediaCaptionLaw.collapse(text) }
    StoryCaptionText(
        text = if (folded.isTruncated) folded.head + "…" else text,
        modifier = modifier
            .fillMaxWidth()
            .padding(start = MeeshySpacing.lg, end = MeeshySpacing.lg, bottom = MeeshySpacing.xl)
            .testTag(STORY_EXPORT_CAPTION_TAG),
    )
}

@Composable
private fun StoryCaptionText(text: String, modifier: Modifier = Modifier) {
    Text(
        text = text,
        color = MeeshyPalette.White,
        style = MaterialTheme.typography.bodyLarge.copy(shadow = CAPTION_SHADOW),
        modifier = modifier,
    )
}
