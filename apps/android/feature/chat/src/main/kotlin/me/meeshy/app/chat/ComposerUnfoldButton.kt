package me.meeshy.app.chat

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Icon
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import me.meeshy.feature.chat.R
import me.meeshy.ui.component.chrome.MeeshyGlassSurface
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.theme.MeeshyIconSize
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

/**
 * La barre repliée (iOS `CommentComposerFoldModifier.unfoldButton`, #9955) : un seul bouton bulle
 * CENTRÉ, cercle de verre liquide de 44 dp, icône `bubble.left.fill` à l'encre primaire. Le toucher
 * rouvre la barre SANS rouvrir le clavier : écrire reste un second geste.
 */
@Composable
internal fun ComposerUnfoldButton(onTap: () -> Unit, modifier: Modifier = Modifier) {
    val label = stringResource(R.string.composer_unfold)
    Box(
        modifier = modifier
            .fillMaxWidth()
            .padding(vertical = MeeshySpacing.sm),
        contentAlignment = Alignment.Center,
    ) {
        MeeshyGlassSurface(
            modifier = Modifier
                .size(44.dp)
                .clip(CircleShape)
                .clickable(role = Role.Button, onClick = onTap)
                .semantics { contentDescription = label },
            shape = CircleShape,
            liquid = true,
        ) {
            Icon(
                imageVector = MeeshyIcons.BubbleTail,
                contentDescription = null,
                tint = MeeshyTheme.tokens.textPrimary,
                modifier = Modifier
                    .align(Alignment.Center)
                    .size(MeeshyIconSize.xl),
            )
        }
    }
}
