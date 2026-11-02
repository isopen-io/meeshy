package me.meeshy.app.profile

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.unit.dp
import me.meeshy.sdk.model.profile.ProfileHeaderMetrics
import me.meeshy.ui.accessibility.decorative
import me.meeshy.ui.component.MeeshySkeletonBox
import me.meeshy.ui.theme.MeeshyRadius
import me.meeshy.ui.theme.MeeshySpacing

internal const val PROFILE_SHEET_SKELETON_TAG = "profile-sheet-skeleton"

/**
 * La fiche sur cache VIDE (miroir de `loadingPlaceholder` iOS, étendu à l'en-tête) : bannière,
 * avatar, nom, pseudo, puis la barre d'onglets et un bloc de contenu. Jamais un spinner plein écran ;
 * dès qu'un profil existe, en cache ou du réseau, la fiche le peint.
 */
@Composable
internal fun ProfileSheetSkeleton(modifier: Modifier = Modifier) {
    Column(
        modifier = modifier
            .fillMaxWidth()
            .testTag(PROFILE_SHEET_SKELETON_TAG)
            .decorative(),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(MeeshySpacing.md),
    ) {
        MeeshySkeletonBox(
            modifier = Modifier.fillMaxWidth().height(ProfileHeaderMetrics.EXPANDED_BANNER_DP.dp),
            shape = RoundedCornerShape(bottomStart = MeeshyRadius.lg, bottomEnd = MeeshyRadius.lg),
        )
        MeeshySkeletonBox(modifier = Modifier.size(96.dp), shape = CircleShape)
        MeeshySkeletonBox(modifier = Modifier.width(160.dp).height(20.dp))
        MeeshySkeletonBox(modifier = Modifier.width(110.dp).height(14.dp))
        Row(
            modifier = Modifier.padding(top = MeeshySpacing.lg),
            horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.sm),
        ) {
            repeat(SKELETON_TABS) {
                MeeshySkeletonBox(
                    modifier = Modifier.width(80.dp).height(30.dp),
                    shape = RoundedCornerShape(MeeshyRadius.xl),
                )
            }
        }
        MeeshySkeletonBox(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = MeeshySpacing.xl)
                .height(60.dp),
            shape = RoundedCornerShape(MeeshyRadius.smPlus),
        )
    }
}

private const val SKELETON_TABS = 2
