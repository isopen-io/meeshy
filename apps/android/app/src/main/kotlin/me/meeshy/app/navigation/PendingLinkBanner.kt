package me.meeshy.app.navigation

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.LinearOutSlowInEasing
import androidx.compose.animation.core.tween
import androidx.compose.animation.expandVertically
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.shrinkVertically
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import me.meeshy.app.R
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshyRadius
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

/** Durée d'entrée du bandeau (iOS `.animation(.easeOut(duration: 0.25))`). */
internal const val PENDING_LINK_ENTER_MILLIS = 250

/**
 * « Connectez-vous : le contenu qu'on vous a partagé s'ouvrira juste après. » (iOS `PendingLinkNotice`), posé au-dessus
 * de l'écran de connexion quand un lien qui demande un compte attend. Le fond est la teinte de marque à faible opacité.
 */
@Composable
internal fun PendingLinkBanner(isVisible: Boolean, modifier: Modifier = Modifier) {
    AnimatedVisibility(
        visible = isVisible,
        modifier = modifier,
        enter = fadeIn(tween(PENDING_LINK_ENTER_MILLIS, easing = LinearOutSlowInEasing)) +
            expandVertically(tween(PENDING_LINK_ENTER_MILLIS, easing = LinearOutSlowInEasing)),
        exit = fadeOut(tween(PENDING_LINK_ENTER_MILLIS, easing = FastOutSlowInEasing)) +
            shrinkVertically(tween(PENDING_LINK_ENTER_MILLIS, easing = FastOutSlowInEasing)),
    ) {
        val brand = MeeshyPalette.Indigo500
        Row(
            verticalAlignment = Alignment.CenterVertically,
            modifier = Modifier
                .statusBarsPadding()
                .fillMaxWidth()
                .padding(horizontal = MeeshySpacing.lg, vertical = MeeshySpacing.sm)
                .clip(RoundedCornerShape(MeeshyRadius.md))
                .background(brand.copy(alpha = 0.12f))
                .heightIn(min = 48.dp)
                .padding(horizontal = MeeshySpacing.lg, vertical = MeeshySpacing.md)
                .semantics(mergeDescendants = true) {},
        ) {
            Icon(imageVector = MeeshyIcons.Link, contentDescription = null, tint = brand)
            Text(
                text = stringResource(R.string.auth_pending_link_notice),
                style = MaterialTheme.typography.bodySmall,
                color = MeeshyTheme.tokens.textPrimary,
                modifier = Modifier.padding(start = MeeshySpacing.sm),
            )
        }
    }
}
