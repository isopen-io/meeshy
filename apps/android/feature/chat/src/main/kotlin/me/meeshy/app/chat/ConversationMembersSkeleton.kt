package me.meeshy.app.chat

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import me.meeshy.ui.component.skeleton.SkeletonBlock
import me.meeshy.ui.component.skeleton.SkeletonShape
import me.meeshy.ui.theme.MeeshySpacing

/** Squelette de la feuille des membres au démarrage à froid : un cercle de 36 dp et deux barres par ligne, avec reflet. */
@Composable
internal fun ConversationMembersSkeleton(rows: Int = 6) {
    Column(modifier = Modifier.fillMaxWidth()) {
        repeat(rows) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = MeeshySpacing.lg, vertical = MeeshySpacing.md),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.md),
            ) {
                SkeletonBlock(width = 36.dp, height = 36.dp, shape = CircleShape)
                Column(verticalArrangement = Arrangement.spacedBy(MeeshySpacing.xs)) {
                    SkeletonShape(width = 140.dp, height = 12.dp)
                    SkeletonShape(width = 90.dp, height = 10.dp)
                }
            }
        }
    }
}
