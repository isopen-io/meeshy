package me.meeshy.ui.component.bubble

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import coil.compose.AsyncImage
import java.time.ZoneId
import java.util.Locale
import me.meeshy.sdk.model.isoToEpochMillisOrNull
import me.meeshy.ui.R
import me.meeshy.ui.format.RelativeTimeFormat
import me.meeshy.ui.format.rememberRelativeTimeStrings
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.theme.MeeshyRadius
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

/** La largeur de la carte (iOS `QuotedReplyPresentation.citedSceneWidth`) et son rapport de scène : 9:16, non recadré. */
private val CARD_WIDTH = 132.dp
private val SCENE_HEIGHT = 235.dp

/**
 * **La story répondue est CITÉE, pas APLATIE** (iOS `BubbleStoryCitationCard`, vue `3h`, #4098/#13296) :
 * la scène en 9:16 telle qu'elle était, un bandeau « réponse à sa story » qui porte sa date, et le
 * toucher qui l'ouvre.
 *
 * - Aucune inférence d'expiration : la carte se rend toujours, le toucher tente toujours — c'est
 *   l'ÉCHEC qui se dit, chez l'hôte. Seule une story RETIRÉE (`message:cited-post-withdrawn`) compacte
 *   la carte au bandeau « Story indisponible », sans scène et sans porte.
 * - Sans scène servie, le texte de la story (ou « 📷 Story ») tient sur un fond teinté.
 * - Un toucher sans cible n'est pas armé : une carte qui s'annoncerait bouton sans rien ouvrir mentirait.
 */
@Composable
internal fun StoryCitationCard(
    story: BubbleStoryReply,
    accentColor: Color,
    onOpen: (() -> Unit)?,
    modifier: Modifier = Modifier,
) {
    val isDark = MeeshyTheme.isDark
    val armed = onOpen.takeIf { story.opensTarget }
    val answerLabel = stringResource(R.string.bubble_story_citation_answer)
    val unavailableLabel = stringResource(R.string.bubble_story_citation_unavailable)
    val storyWord = stringResource(R.string.bubble_reply_story)
    val sceneText = story.previewText.ifBlank { "📷 $storyWord" }
    val openHint = stringResource(R.string.bubble_story_citation_open_hint)
    val description = "$answerLabel, ${if (story.isUnavailable) unavailableLabel else sceneText}"
    Column(
        modifier = modifier
            .width(CARD_WIDTH)
            .clip(RoundedCornerShape(MeeshyRadius.lg))
            .then(if (armed != null) Modifier.clickable(onClickLabel = openHint, onClick = armed) else Modifier)
            .clearAndSetSemantics {
                contentDescription = description
                if (armed != null) role = Role.Button
            },
    ) {
        if (!story.isUnavailable) StoryCitationScene(story, sceneText, accentColor, isDark)
        StoryCitationStrip(story, answerLabel, unavailableLabel, accentColor, isDark)
    }
}

@Composable
private fun StoryCitationScene(story: BubbleStoryReply, sceneText: String, accentColor: Color, isDark: Boolean) {
    val fallback = accentColor.copy(alpha = if (isDark) 0.32f else 0.24f)
    Box(
        modifier = Modifier
            .width(CARD_WIDTH)
            .height(SCENE_HEIGHT)
            .background(fallback),
        contentAlignment = Alignment.Center,
    ) {
        if (story.thumbnailUrl != null) {
            AsyncImage(
                model = story.thumbnailUrl,
                contentDescription = null,
                contentScale = ContentScale.Crop,
                modifier = Modifier
                    .width(CARD_WIDTH)
                    .height(SCENE_HEIGHT),
            )
        } else {
            Text(
                text = sceneText,
                style = MaterialTheme.typography.bodyMedium,
                fontWeight = FontWeight.SemiBold,
                color = Color.White,
                textAlign = TextAlign.Center,
                maxLines = 4,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.padding(horizontal = MeeshySpacing.smPlus),
            )
        }
    }
}

@Composable
private fun StoryCitationStrip(
    story: BubbleStoryReply,
    answerLabel: String,
    unavailableLabel: String,
    accentColor: Color,
    isDark: Boolean,
) {
    val tint = if (isDark) Color.White.copy(alpha = 0.82f) else Color.Black.copy(alpha = 0.72f)
    val strings = rememberRelativeTimeStrings()
    val dateLabel = remember(story.publishedAtIso, strings) {
        isoToEpochMillisOrNull(story.publishedAtIso)?.let { millis ->
            RelativeTimeFormat.short(millis, System.currentTimeMillis(), ZoneId.systemDefault(), Locale.getDefault(), strings)
        }
    }
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .background(accentColor.copy(alpha = if (isDark) 0.28f else 0.16f))
            .padding(horizontal = MeeshySpacing.sm, vertical = MeeshySpacing.xs),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.xs)) {
            Icon(MeeshyIcons.Reply, contentDescription = null, tint = tint, modifier = Modifier.size(11.dp))
            Text(
                text = answerLabel,
                style = MaterialTheme.typography.labelMedium,
                fontWeight = FontWeight.Medium,
                color = tint,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
        }
        val second = if (story.isUnavailable) unavailableLabel else dateLabel
        if (second != null) {
            Text(
                text = second,
                style = MaterialTheme.typography.labelSmall,
                color = tint.copy(alpha = if (story.isUnavailable) 1f else 0.8f),
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
        }
    }
}
