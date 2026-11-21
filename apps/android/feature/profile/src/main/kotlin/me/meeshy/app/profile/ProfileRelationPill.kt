package me.meeshy.app.profile

import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.testTag
import me.meeshy.sdk.model.relation.RelationLevel
import me.meeshy.ui.component.circles.levelTitle
import me.meeshy.ui.component.circles.tint
import me.meeshy.ui.component.kit.MeeshyCircleScale
import me.meeshy.ui.component.kit.MeeshyCircleScaleForm
import me.meeshy.ui.component.kit.MeeshyCircleScaleLevel
import me.meeshy.ui.component.kit.MeeshyCircleScaleSize
import me.meeshy.ui.icons.MeeshyIcons

internal const val PROFILE_RELATION_PILL_TAG = "profile-relation-pill"

/** Le glyphe du jeu pour chaque cercle ; l'échelle de K33 le teinte par l'intensité, jamais par une couleur par niveau. */
internal fun RelationLevel.glyph(): ImageVector = when (this) {
    RelationLevel.PUBLIC -> MeeshyIcons.Globe
    RelationLevel.COMMUNITY -> MeeshyIcons.Groups
    RelationLevel.ACQUAINTANCE -> MeeshyIcons.Hand
    RelationLevel.FRIEND -> MeeshyIcons.Heart
    RelationLevel.CLOSE -> MeeshyIcons.Flame
    RelationLevel.BLOOD -> MeeshyIcons.Diamond
}

/** L'échelle complète des cercles, nommée dans la langue de l'interface, pour les formes de K33. */
@Composable
internal fun relationScaleLevels(): List<MeeshyCircleScaleLevel> =
    RelationLevel.entries.map { MeeshyCircleScaleLevel(title = levelTitle(it, null), icon = it.glyph()) }

/**
 * La pilule de relation : le cercle commun avec cette personne, dit par K33 (glyphe et nom, « Ami, 4 sur 6 » au lecteur
 * d'écran). Toucher la pilule ouvre « Notre cercle » — le geste de la planche, un seul pour voir et pour monter.
 */
@Composable
internal fun ProfileRelationPill(level: RelationLevel, onClick: () -> Unit, modifier: Modifier = Modifier) {
    MeeshyCircleScale(
        levels = relationScaleLevels(),
        current = level.ordinal,
        form = MeeshyCircleScaleForm.Pill,
        size = MeeshyCircleScaleSize.Compact,
        tint = level.tint(),
        onSelect = { onClick() },
        modifier = modifier.testTag(PROFILE_RELATION_PILL_TAG),
    )
}
