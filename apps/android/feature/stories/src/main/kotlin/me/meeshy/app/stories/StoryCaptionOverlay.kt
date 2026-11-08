package me.meeshy.app.stories

import androidx.compose.animation.core.snap
import androidx.compose.animation.core.spring
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Shadow
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.IntSize
import me.meeshy.sdk.model.story.StoryCaptionPlacement
import me.meeshy.ui.accessibility.LocalReduceMotion
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import me.meeshy.feature.stories.R
import me.meeshy.sdk.model.caption.MediaCaptionLaw
import me.meeshy.ui.component.viewer.MediaCaptionOverlay
import androidx.compose.ui.unit.Dp
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshySpacing

private val CAPTION_SHADOW = Shadow(color = Color.Black.copy(alpha = 0.65f), offset = Offset(0f, 1f), blurRadius = 6f)

/**
 * La légende d'une story, posée en bas à gauche avec 20 dp de retrait — le [MediaCaptionOverlay] partagé avec les
 * réels : ombrée plutôt qu'encadrée, repliée au-delà du seuil de [MediaCaptionLaw], dépliée dans une fenêtre
 * défilante (ressort 0,38 / 0,82) dont le tap hors du texte referme sans changer de story. Elle laisse la bande du rail
 * libre ([railClearance]) et se pose sur le compositeur épinglé ([bottomInset], hauteur mesurée). Dépliée, la zone au-dessus
 * du texte ramène celui-ci à son premier mot sans fermer l'en-tête ni le rail. L'état déplié est HISSÉ : le lecteur
 * le lit (boucle, estompe de la scène, repli au changement de slide).
 */
@Composable
internal fun StoryCaptionOverlay(
    text: String,
    expanded: Boolean,
    onToggle: () -> Unit,
    modifier: Modifier = Modifier,
    trackedLinks: Map<String, String>? = null,
    validUsernames: Set<String>? = null,
    bottomInset: Dp = 0.dp,
    topChromeReserve: Dp = 0.dp,
    railClearance: Dp = StoryCaptionPlacement.RAIL_BAND_DP.dp,
) {
    var scrollToTop by remember { mutableIntStateOf(0) }
    val folded = remember(text) { MediaCaptionLaw.collapse(text) }
    val reduceMotion = LocalReduceMotion.current
    val spec = remember(reduceMotion) {
        if (reduceMotion) {
            snap<IntSize>()
        } else {
            spring<IntSize>(
                dampingRatio = StoryCaptionPlacement.SPRING_DAMPING,
                stiffness = StoryCaptionPlacement.springStiffness(),
            )
        }
    }
    val label = stringResource(R.string.story_caption_scroll_to_top)
    val hint = stringResource(R.string.story_caption_scroll_to_top_hint)
    MediaCaptionOverlay(
        caption = text,
        expanded = expanded,
        onToggle = onToggle,
        modifier = modifier,
        trackedLinks = trackedLinks,
        validUsernames = validUsernames,
        startInset = StoryCaptionPlacement.SIDE_INSET_DP.dp,
        endInset = railClearance,
        bottomInset = bottomInset,
        dimsBackgroundWhenExpanded = false,
        scrollToTopToken = scrollToTop,
        expandSpec = spec,
    )
    if (expanded && folded.isTruncated) {
        Box(
            Modifier
                .fillMaxWidth()
                .fillMaxHeight(SCROLL_TARGET_FRACTION)
                .padding(top = topChromeReserve, end = railClearance)
                .clickable(interactionSource = remember { MutableInteractionSource() }, indication = null) { scrollToTop += 1 }
                .semantics {
                    role = Role.Button
                    contentDescription = "$label. $hint"
                }
                .testTag(STORY_CAPTION_SCROLL_TOP_TAG),
        )
    }
}

/** Part haute de l'écran dont le toucher ramène le texte déplié en tête (iOS `captionScrollToTopTarget`). */
private const val SCROLL_TARGET_FRACTION = 0.4f
internal const val STORY_CAPTION_SCROLL_TOP_TAG = "story.caption.scrollToTop"

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
