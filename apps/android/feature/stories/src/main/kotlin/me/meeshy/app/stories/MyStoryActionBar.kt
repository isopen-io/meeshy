package me.meeshy.app.stories

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.unit.dp
import me.meeshy.feature.stories.R
import me.meeshy.sdk.model.MyStoryGlyph
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

/**
 * La bande de glyphes sous la vignette (iOS `MyStoryActionBar`) : les glyphes se PARTAGENT la largeur de la
 * carte (aucun minimum rigide qui ferait déborder sur la colonne voisine), la hauteur de 44 dp tient la cible
 * tactile. Le compteur n'existe que s'il est positif ; les réactions sont un indicateur pur, sans action.
 */
@Composable
internal fun MyStoryActionBar(
    glyphs: List<MyStoryGlyphSlot>,
    onGlyph: (MyStoryGlyph) -> Unit,
    modifier: Modifier = Modifier,
) {
    Row(
        modifier = modifier.fillMaxWidth().padding(vertical = MeeshySpacing.xs),
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.xxs),
    ) {
        glyphs.forEach { slot -> GlyphItem(slot, onGlyph) }
    }
}

@Composable
private fun RowScope.GlyphItem(slot: MyStoryGlyphSlot, onGlyph: (MyStoryGlyph) -> Unit) {
    val glyph = slot.glyph
    val label = stringResource(glyph.labelRes())
    val base = Modifier.weight(1f).heightIn(min = 44.dp)
    val modifier = if (glyph.isInteractive) {
        base.clickable(role = Role.Button, onClickLabel = label) { onGlyph(glyph) }
            .semantics { contentDescription = label }
    } else {
        base.semantics {
            contentDescription = label
            slot.count?.let { stateDescription = it.toString() }
        }
    }
    Row(modifier, horizontalArrangement = Arrangement.Center, verticalAlignment = Alignment.CenterVertically) {
        Icon(
            imageVector = glyph.icon(),
            contentDescription = null,
            tint = MeeshyTheme.tokens.textSecondary,
            modifier = Modifier.size(18.dp),
        )
        slot.count?.let { count ->
            Text(
                text = count.toString(),
                style = MaterialTheme.typography.labelSmall,
                color = MeeshyTheme.tokens.textSecondary,
                modifier = Modifier.padding(start = MeeshySpacing.xxs),
            )
        }
    }
}

private fun MyStoryGlyph.icon() = when (this) {
    MyStoryGlyph.VIEWS_AND_REACTIONS -> MeeshyIcons.Eye
    MyStoryGlyph.REACTIONS -> MeeshyIcons.HeartFilled
    MyStoryGlyph.COMMENTS -> MeeshyIcons.Chat
    MyStoryGlyph.MORE -> MeeshyIcons.MoreHorizontal
    MyStoryGlyph.PUBLISH -> MeeshyIcons.Send
}

private fun MyStoryGlyph.labelRes(): Int = when (this) {
    MyStoryGlyph.VIEWS_AND_REACTIONS -> R.string.my_stories_glyph_views
    MyStoryGlyph.REACTIONS -> R.string.my_stories_glyph_reactions
    MyStoryGlyph.COMMENTS -> R.string.my_stories_glyph_comments
    MyStoryGlyph.MORE -> R.string.my_stories_more
    MyStoryGlyph.PUBLISH -> R.string.my_stories_glyph_publish
}
