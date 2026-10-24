package me.meeshy.app.profile

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.unit.dp
import me.meeshy.ui.component.MeeshySkeletonBox
import me.meeshy.ui.theme.MeeshyRadius
import me.meeshy.ui.theme.MeeshySpacing

/** Le marqueur de test du squelette de MA page. */
internal const val OWN_PROFILE_SKELETON_TAG = "own_profile_skeleton"

/**
 * Le squelette d'en-tête de MA page (iOS `SkeletonProfileHeader`) : seulement quand AUCUNE identité n'est en
 * mémoire (premier lancement, après déconnexion), pour ne jamais faire clignoter des « ? » de repli. Une
 * identité en cache se peint toujours, même périmée.
 */
@Composable
internal fun OwnProfileSkeleton(modifier: Modifier = Modifier) {
    Column(
        modifier = modifier.fillMaxWidth().testTag(OWN_PROFILE_SKELETON_TAG),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(MeeshySpacing.sm),
    ) {
        MeeshySkeletonBox(
            modifier = Modifier.fillMaxWidth().height(OwnProfileHeaderMetrics.BannerHeight),
            shape = RoundedCornerShape(MeeshyRadius.lg),
        )
        Box(Modifier.offset(y = -OwnProfileHeaderMetrics.AvatarOverlap)) {
            MeeshySkeletonBox(modifier = Modifier.size(OwnProfileHeaderMetrics.AvatarSize), shape = CircleShape)
        }
        MeeshySkeletonBox(modifier = Modifier.width(160.dp).height(20.dp).offset(y = -OwnProfileHeaderMetrics.AvatarOverlap))
        MeeshySkeletonBox(modifier = Modifier.width(110.dp).height(14.dp).offset(y = -OwnProfileHeaderMetrics.AvatarOverlap))
    }
}
