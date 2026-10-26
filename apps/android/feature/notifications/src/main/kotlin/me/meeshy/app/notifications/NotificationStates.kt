package me.meeshy.app.notifications

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CloudOff
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import me.meeshy.feature.notifications.R
import me.meeshy.sdk.model.NotificationFilterCategory
import me.meeshy.ui.component.MeeshyEmptyState
import me.meeshy.ui.component.MeeshyPrimaryButton
import me.meeshy.ui.component.MeeshySkeletonBox
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme
import me.meeshy.ui.theme.hexColor

private const val SKELETON_ROWS = 7
private val TITLE_WIDTHS = intArrayOf(140, 112, 168, 126, 154)
private val BODY_WIDTHS = intArrayOf(210, 168, 240, 190, 154)

/**
 * Ce que la cloche montre pendant un démarrage à FROID — cache vide, réseau en vol : la forme d'une
 * rangée (pastille, titre, corps), pas l'aveu qu'on attend. Largeurs inégales : trois lignes
 * identiques se liraient comme un gabarit cassé. Masqué à TalkBack, qui lit « Chargement ».
 */
@Composable
internal fun NotificationListSkeleton(modifier: Modifier = Modifier) {
    val loading = stringResource(R.string.notifications_loading)
    Column(modifier = modifier.fillMaxSize().semantics { contentDescription = loading }) {
        repeat(SKELETON_ROWS) { index ->
            Row(
                modifier = Modifier.fillMaxWidth().padding(horizontal = MeeshySpacing.lg, vertical = MeeshySpacing.md)
                    .clearAndSetSemantics { },
                horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.md),
            ) {
                MeeshySkeletonBox(Modifier.size(44.dp), CircleShape)
                Column(verticalArrangement = Arrangement.spacedBy(MeeshySpacing.sm)) {
                    MeeshySkeletonBox(Modifier.width(TITLE_WIDTHS[index % TITLE_WIDTHS.size].dp).height(13.dp))
                    MeeshySkeletonBox(Modifier.fillMaxWidth().height(11.dp))
                    MeeshySkeletonBox(Modifier.width(BODY_WIDTHS[index % BODY_WIDTHS.size].dp).height(11.dp))
                }
            }
        }
    }
}

/** Le chargement a ÉCHOUÉ sur une liste vide : distinct du vide, avec le seul geste qui vaille — réessayer. */
@Composable
internal fun NotificationListErrorState(onRetry: () -> Unit, modifier: Modifier = Modifier) {
    Column(
        modifier = modifier.fillMaxSize().padding(horizontal = MeeshySpacing.xxxl),
        verticalArrangement = Arrangement.spacedBy(MeeshySpacing.lg, Alignment.CenterVertically),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Icon(Icons.Filled.CloudOff, contentDescription = null, tint = MeeshyPalette.Error.copy(alpha = 0.6f), modifier = Modifier.size(56.dp))
        Text(
            stringResource(R.string.notifications_error_title),
            style = MaterialTheme.typography.titleMedium,
            color = MeeshyTheme.tokens.textPrimary,
            textAlign = TextAlign.Center,
        )
        Text(
            stringResource(R.string.notifications_error_subtitle),
            style = MaterialTheme.typography.bodyMedium,
            color = MeeshyTheme.tokens.textMuted,
            textAlign = TextAlign.Center,
        )
        Spacer(Modifier.height(MeeshySpacing.xs))
        MeeshyPrimaryButton(text = stringResource(R.string.notifications_error_retry), onClick = onRetry)
    }
}

/** L'état vide d'une catégorie : son icône à sa couleur, son message, et la promesse du sous-titre. */
@Composable
internal fun NotificationListEmptyState(category: NotificationFilterCategory, modifier: Modifier = Modifier) {
    MeeshyEmptyState(
        icon = category.icon(),
        title = stringResource(category.emptyRes()),
        subtitle = stringResource(R.string.notifications_empty_subtitle),
        modifier = modifier,
        accent = hexColor(category.accentHex),
    )
}
