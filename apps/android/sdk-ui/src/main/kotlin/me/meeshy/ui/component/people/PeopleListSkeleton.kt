package me.meeshy.ui.component.people

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import me.meeshy.ui.R
import me.meeshy.ui.component.MeeshySkeletonBox
import me.meeshy.ui.theme.MeeshyControlSize
import me.meeshy.ui.theme.MeeshyRadius
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

/** Nombre de lignes du squelette de démarrage à froid (iOS `ContactsSkeletonList(count: 5)`). */
public const val PEOPLE_SKELETON_ROWS: Int = 5

/**
 * Le squelette des écrans Personnes (iOS `ContactsSkeletonList`) : cinq lignes avatar 44 dp + deux barres
 * (120x14, 80x11) qui respirent. Il remplace tout spinner nu sur cache VIDE — jamais montré quand le cache
 * porte des données, même périmées. Un seul nœud TalkBack : « Chargement en cours ».
 */
@Composable
public fun PeopleListSkeleton(
    modifier: Modifier = Modifier,
    count: Int = PEOPLE_SKELETON_ROWS,
) {
    val label = stringResource(R.string.contacts_skeleton_loading)
    Column(
        modifier = modifier
            .fillMaxWidth()
            .padding(horizontal = MeeshySpacing.lg)
            .padding(top = MeeshySpacing.lg)
            .semantics(mergeDescendants = true) { contentDescription = label },
        verticalArrangement = Arrangement.spacedBy(MeeshySpacing.md),
    ) {
        repeat(count) { PeopleSkeletonRow() }
    }
}

@Composable
private fun PeopleSkeletonRow() {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .background(MeeshyTheme.tokens.surfaceFill, RoundedCornerShape(MeeshyRadius.md))
            .padding(horizontal = MeeshySpacing.md, vertical = MeeshySpacing.sm)
            .clearAndSetSemantics { },
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.md),
    ) {
        MeeshySkeletonBox(modifier = Modifier.size(MeeshyControlSize.tapTarget), shape = CircleShape)
        Column(verticalArrangement = Arrangement.spacedBy(MeeshySpacing.xs)) {
            MeeshySkeletonBox(modifier = Modifier.width(120.dp).height(14.dp), shape = RoundedCornerShape(MeeshyRadius.xxs))
            MeeshySkeletonBox(modifier = Modifier.width(80.dp).height(11.dp), shape = RoundedCornerShape(3.dp))
        }
    }
}
