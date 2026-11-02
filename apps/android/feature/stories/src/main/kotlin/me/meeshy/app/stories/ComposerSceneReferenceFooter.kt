package me.meeshy.app.stories

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import me.meeshy.feature.stories.R
import me.meeshy.sdk.model.PostMentionInput
import me.meeshy.sdk.model.composer.ComposerSceneReferences
import me.meeshy.ui.theme.MeeshyRadius
import me.meeshy.ui.theme.MeeshySpacing

private val FOOTER_VEIL = Color.Black.copy(alpha = 0.38f)

/**
 * Le pied de scène des références (#13846, iOS `ComposerSceneReferences`) : les hashtags, puis la rangée « Avec … » des
 * mentions RÉFÉRENCÉES — la même que le lecteur montrera. Une mention épinglée est déjà sa pastille, une silencieuse ne
 * paraît jamais ; sans rien à dire, le pied n'existe pas. Toucher une moitié rouvre la feuille qui la règle.
 */
@Composable
internal fun ComposerSceneReferenceFooter(
    hashtags: List<String>,
    mentions: List<PostMentionInput>,
    onHashtags: () -> Unit,
    onMentions: () -> Unit,
) {
    if (!ComposerSceneReferences.isServed(hashtags, mentions)) return
    val noted = ComposerSceneReferences.noted(mentions)
    Row(
        modifier = Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()),
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.sm),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        if (hashtags.isNotEmpty()) {
            val spoken = ComposerSceneReferences.spoken(stringResource(R.string.story_hashtag_title), hashtags)
            FooterChip(text = hashtags.joinToString(" ") { "#$it" }, spoken = spoken, onClick = onHashtags)
        }
        if (noted.isNotEmpty()) {
            val names = noted.joinToString(", ") { "@${it.username.orEmpty()}" }
            val text = stringResource(R.string.story_references_with, names)
            FooterChip(text = text, spoken = text, onClick = onMentions)
        }
    }
}

@Composable
private fun FooterChip(text: String, spoken: String, onClick: () -> Unit) {
    Row(
        modifier = Modifier
            .heightIn(min = 48.dp)
            .clickable(onClick = onClick)
            .semantics(mergeDescendants = true) {
                role = Role.Button
                contentDescription = spoken
            }
            .padding(vertical = 6.dp)
            .background(FOOTER_VEIL, RoundedCornerShape(MeeshyRadius.sm))
            .padding(horizontal = MeeshySpacing.sm, vertical = 6.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(4.dp),
    ) {
        Text(
            text = text,
            style = MaterialTheme.typography.bodySmall,
            color = Color.White,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
        )
    }
}
