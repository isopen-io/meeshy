package me.meeshy.app.settings

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.unit.dp
import me.meeshy.feature.settings.R
import me.meeshy.ui.component.skeleton.SkeletonShape
import me.meeshy.ui.theme.MeeshyRadius
import me.meeshy.ui.theme.MeeshySpacing

/** Cache vide, premier appel : trois lignes (pastille 32, puis largeurs 140 / pleine / 180), comme iOS. */
@Composable
internal fun ActiveSessionsSkeleton(modifier: Modifier = Modifier) {
    val label = stringResource(R.string.sessions_loading)
    Column(
        modifier = modifier
            .fillMaxWidth()
            .padding(top = MeeshySpacing.lg)
            .clearAndSetSemantics { contentDescription = label },
        verticalArrangement = Arrangement.spacedBy(MeeshySpacing.lg),
    ) {
        repeat(SKELETON_ROWS) {
            Row(
                modifier = Modifier.fillMaxWidth().padding(MeeshySpacing.md),
                horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.md),
                verticalAlignment = Alignment.Top,
            ) {
                SkeletonShape(width = 32.dp, height = 32.dp, cornerRadius = MeeshyRadius.xs)
                Column(verticalArrangement = Arrangement.spacedBy(MeeshySpacing.xs)) {
                    SkeletonShape(width = 140.dp, height = 14.dp)
                    SkeletonShape(modifier = Modifier.fillMaxWidth(), height = 10.dp)
                    SkeletonShape(width = 180.dp, height = 10.dp)
                }
            }
        }
    }
}

private const val SKELETON_ROWS = 3
