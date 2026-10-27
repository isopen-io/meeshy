package me.meeshy.app.stories

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import me.meeshy.feature.stories.R
import me.meeshy.sdk.model.composer.MediaDescriptionLaw
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.theme.MeeshySpacing

/**
 * Accessibilité des médias de la slide : texte alternatif (décrit l'image sans l'afficher) et
 * légende (affichée sous le média) — DEUX contenus distincts du texte de la publication —, plus
 * le drapeau UNIQUE d'extraction du son, proposé seulement si un média est une vidéo. Les médias
 * non décrits sont rappelés sur l'en-tête, sans jamais bloquer la publication.
 */
@Composable
internal fun ComposerMediaDescription(
    mediaIds: List<String>,
    alt: Map<String, String>,
    caption: Map<String, String>,
    undescribedCount: Int,
    offersSoundExtraction: Boolean,
    allowSoundExtraction: Boolean,
    onAltChange: (String, String) -> Unit,
    onCaptionChange: (String, String) -> Unit,
    onAllowSoundExtractionChange: (Boolean) -> Unit,
) {
    if (mediaIds.isEmpty()) return
    var expanded by rememberSaveable { mutableStateOf(false) }
    Column(verticalArrangement = Arrangement.spacedBy(MeeshySpacing.sm)) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .heightIn(min = 44.dp)
                .clickable { expanded = !expanded }
                .semantics { role = Role.Button },
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.sm),
        ) {
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    stringResource(R.string.story_media_accessibility),
                    style = MaterialTheme.typography.labelLarge,
                    fontWeight = FontWeight.SemiBold,
                )
                if (undescribedCount > 0) {
                    Text(
                        stringResource(R.string.stories_media_undescribed),
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }
            Icon(if (expanded) MeeshyIcons.ChevronUp else MeeshyIcons.ChevronDown, contentDescription = null)
        }
        AnimatedVisibility(visible = expanded) {
            Column(verticalArrangement = Arrangement.spacedBy(MeeshySpacing.sm)) {
                mediaIds.forEachIndexed { index, id ->
                    MediaFields(index + 1, id, alt[id].orEmpty(), caption[id].orEmpty(), onAltChange, onCaptionChange)
                }
                if (offersSoundExtraction) SoundExtractionRow(allowSoundExtraction, onAllowSoundExtractionChange)
            }
        }
    }
}

@Composable
private fun MediaFields(
    position: Int,
    id: String,
    alt: String,
    caption: String,
    onAltChange: (String, String) -> Unit,
    onCaptionChange: (String, String) -> Unit,
) {
    val altLabel = stringResource(R.string.story_media_alt_label)
    val captionLabel = stringResource(R.string.story_media_caption_label)
    val altHint = stringResource(R.string.story_media_alt_a11yHint)
    val captionHint = stringResource(R.string.story_media_caption_a11yHint)
    Column(verticalArrangement = Arrangement.spacedBy(MeeshySpacing.xs)) {
        OutlinedTextField(
            value = alt,
            onValueChange = { onAltChange(id, it.take(MediaDescriptionLaw.MAX_LENGTH)) },
            label = { Text("$altLabel · $position") },
            placeholder = { Text(stringResource(R.string.story_media_alt_placeholder)) },
            modifier = Modifier.fillMaxWidth().semantics { contentDescription = altHint },
        )
        OutlinedTextField(
            value = caption,
            onValueChange = { onCaptionChange(id, it.take(MediaDescriptionLaw.MAX_LENGTH)) },
            label = { Text("$captionLabel · $position") },
            placeholder = { Text(stringResource(R.string.story_media_caption_placeholder)) },
            modifier = Modifier.fillMaxWidth().semantics { contentDescription = captionHint },
        )
    }
}

@Composable
private fun SoundExtractionRow(allowed: Boolean, onChange: (Boolean) -> Unit) {
    val hint = stringResource(R.string.story_media_soundExtraction_a11yHint)
    Row(
        modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp).padding(vertical = MeeshySpacing.xs),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.md),
    ) {
        Column(modifier = Modifier.weight(1f)) {
            Text(stringResource(R.string.story_media_soundExtraction_label), style = MaterialTheme.typography.bodyMedium)
            Text(
                stringResource(R.string.story_media_soundExtraction_caption),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
        Switch(checked = allowed, onCheckedChange = onChange, modifier = Modifier.semantics { contentDescription = hint })
    }
}
