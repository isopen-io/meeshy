package me.meeshy.app.notifications

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import me.meeshy.feature.notifications.R
import me.meeshy.sdk.model.NotificationFilterCategory
import me.meeshy.ui.component.MeeshyEmptyState
import me.meeshy.ui.component.MeeshySkeletonBox
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

internal const val SKELETON_ROWS = 7
internal val SKELETON_TITLE_WIDTHS = intArrayOf(140, 112, 168, 126, 154)
internal val SKELETON_BODY_WIDTHS = intArrayOf(240, 190, 220, 170, 200)
internal val RETRY_MIN_HEIGHT = 44.dp

/**
 * Ce que la cloche montre pendant un démarrage à FROID — cache vide, réseau en vol : la forme d'une
 * rangée (cercle 44 dp, titre + heure, deux lignes de corps dont la seconde est plus courte), pas
 * l'aveu qu'on attend. Largeurs inégales : des lignes identiques se liraient comme un gabarit cassé.
 * Un seul nœud TalkBack « Chargement… » ; la liste ne défile pas (aucun scroll posé).
 */
@Composable
internal fun NotificationListSkeleton(modifier: Modifier = Modifier) {
    val loading = stringResource(R.string.notifications_loading)
    Column(modifier = modifier.fillMaxSize().semantics { contentDescription = loading }) {
        repeat(SKELETON_ROWS) { index ->
            Row(
                modifier = Modifier.fillMaxWidth()
                    .padding(horizontal = MeeshySpacing.lg, vertical = MeeshySpacing.md)
                    .clearAndSetSemantics { },
                horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.md),
            ) {
                MeeshySkeletonBox(Modifier.size(44.dp), CircleShape)
                Column(verticalArrangement = Arrangement.spacedBy(MeeshySpacing.sm)) {
                    Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                        MeeshySkeletonBox(Modifier.width(SKELETON_TITLE_WIDTHS[index % SKELETON_TITLE_WIDTHS.size].dp).height(13.dp))
                        Spacer(Modifier.weight(1f))
                        MeeshySkeletonBox(Modifier.width(30.dp).height(9.dp))
                    }
                    MeeshySkeletonBox(Modifier.fillMaxWidth().height(11.dp))
                    MeeshySkeletonBox(Modifier.width(SKELETON_BODY_WIDTHS[index % SKELETON_BODY_WIDTHS.size].dp).height(11.dp))
                }
            }
        }
    }
}

/** Le chargement a ÉCHOUÉ sans aucune ligne en cache : distinct du vide, avec le seul geste qui vaille — réessayer. */
@Composable
internal fun NotificationListErrorState(onRetry: () -> Unit, modifier: Modifier = Modifier) {
    Column(
        modifier = modifier.fillMaxSize().padding(horizontal = MeeshySpacing.xxxl),
        verticalArrangement = Arrangement.spacedBy(MeeshySpacing.lg, Alignment.CenterVertically),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Icon(
            MeeshyIcons.WifiOff,
            contentDescription = null,
            tint = MeeshyPalette.Error.copy(alpha = 0.4f),
            modifier = Modifier.size(52.dp).clearAndSetSemantics { },
        )
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
        NotificationRetryCapsule(onRetry)
    }
}

/** Le bouton capsule « Réessayer » : cible de 44 dp au moins, dégradé de marque. */
@Composable
internal fun NotificationRetryCapsule(onRetry: () -> Unit, modifier: Modifier = Modifier) {
    Box(
        modifier = modifier
            .defaultMinSize(minHeight = RETRY_MIN_HEIGHT, minWidth = RETRY_MIN_HEIGHT)
            .clip(CircleShape)
            .background(Brush.linearGradient(MeeshyPalette.BrandGradient))
            .clickable(role = Role.Button, onClick = onRetry)
            .padding(horizontal = MeeshySpacing.xl),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            stringResource(R.string.notifications_error_retry),
            style = MaterialTheme.typography.labelLarge,
            fontWeight = FontWeight.SemiBold,
            color = androidx.compose.ui.graphics.Color.White,
        )
    }
}

/** L'état vide d'une catégorie : son icône à sa couleur (40 %, taille hero) et son titre propre, rien d'autre (#18083). */
@Composable
internal fun NotificationListEmptyState(category: NotificationFilterCategory, modifier: Modifier = Modifier) {
    MeeshyEmptyState(
        icon = category.icon(),
        title = stringResource(category.emptyRes()),
        subtitle = "",
        modifier = modifier,
        accent = category.color(),
    )
}
