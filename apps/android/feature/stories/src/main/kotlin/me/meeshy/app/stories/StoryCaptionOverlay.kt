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
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import me.meeshy.feature.stories.R
import me.meeshy.sdk.model.MediaCaptionRule
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshySpacing

/** Le rail d'actions occupe la bande droite : la légende s'arrête avant lui. */
private val RAIL_CLEARANCE = 72.dp

private val CAPTION_SHADOW = Shadow(color = Color.Black.copy(alpha = 0.65f), offset = Offset(0f, 1f), blurRadius = 6f)

/**
 * La légende d'une story, posée en bas à gauche — iOS `MediaCaptionOverlay` : ombrée
 * plutôt qu'encadrée pour ne pas masquer la composition qu'elle commente, repliée à 15
 * mots au-delà de 30 ([MediaCaptionRule]), dépliée et repliée par « voir plus » /
 * « voir moins ». Elle laisse la bande du rail libre : le bouton de réaction ne la
 * recouvre plus. Chaque story repart repliée.
 */
@Composable
internal fun StoryCaptionOverlay(text: String, storyId: String, modifier: Modifier = Modifier) {
    var expanded by rememberSaveable(storyId) { mutableStateOf(false) }
    val folded = remember(text) { MediaCaptionRule.collapse(text) }
    val shown = if (expanded || !folded.isTruncated) text else folded.head + "…"
    Column(
        modifier = modifier
            .fillMaxWidth()
            .navigationBarsPadding()
            .padding(start = MeeshySpacing.lg, end = RAIL_CLEARANCE, bottom = MeeshySpacing.xl),
    ) {
        Text(
            text = shown,
            color = MeeshyPalette.White,
            style = MaterialTheme.typography.bodyLarge.copy(shadow = CAPTION_SHADOW),
        )
        if (folded.isTruncated) {
            Text(
                text = stringResource(if (expanded) R.string.stories_caption_see_less else R.string.stories_caption_see_more),
                color = MeeshyPalette.White,
                fontWeight = FontWeight.SemiBold,
                style = MaterialTheme.typography.bodyMedium.copy(shadow = CAPTION_SHADOW),
                modifier = Modifier
                    .clickable { expanded = !expanded }
                    .padding(vertical = MeeshySpacing.sm),
            )
        }
    }
}
