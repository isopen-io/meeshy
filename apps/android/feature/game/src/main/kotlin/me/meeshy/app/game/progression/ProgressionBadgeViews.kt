package me.meeshy.app.game.progression

import android.content.res.Resources
import androidx.annotation.StringRes
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import java.util.Locale
import me.meeshy.app.game.reveal.RevealCopy
import me.meeshy.app.game.reveal.toGameMaterial
import me.meeshy.feature.game.R
import me.meeshy.sdk.model.game.GameBlock
import me.meeshy.sdk.model.game.GameNumberFormat
import me.meeshy.sdk.model.game.engagement.AchievementEntry
import me.meeshy.sdk.model.game.engagement.AchievementSectionView
import me.meeshy.sdk.model.game.engagement.BadgeGuide
import me.meeshy.sdk.model.game.engagement.BadgeGuideResolver
import me.meeshy.sdk.model.game.engagement.BadgeMaterialKey
import me.meeshy.sdk.model.game.engagement.BadgeRung
import me.meeshy.sdk.model.game.engagement.BadgeRungState
import me.meeshy.sdk.model.game.engagement.EngagementAxisFamily
import me.meeshy.sdk.model.game.engagement.EngagementAxisKey
import me.meeshy.sdk.model.game.engagement.EngagementAxisProgress
import me.meeshy.sdk.model.game.engagement.EngagementProgress
import me.meeshy.sdk.model.game.engagement.RevealTitle
import me.meeshy.ui.component.game.GameMedalFamily
import me.meeshy.ui.component.game.GameMedalGlyph
import me.meeshy.ui.component.game.GameMedalState
import me.meeshy.ui.component.game.GameMedalView
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshyRadius
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

/** Le lien « Comprendre les médailles » — le même partout : étagère de la fiche, page des médailles (iOS `GameBadgeGuideLink`). */
@Composable
internal fun BadgeGuideLink(onClick: () -> Unit) {
    ConceptLink(stringResource(R.string.game_badge_guide_link), leading = MeeshyIcons.Info, onClick = onClick)
}

/**
 * LA SUITE COMPACTE D'UNE MÉDAILLE (iOS `GameBadgeUpcomingView`) : « À VENIR », puis chaque palier à venir, sa matière
 * et son seuil — la prochaine étoile en indigo. Au Prisme, la phrase de l'échelle complète. Lue d'un trait au lecteur
 * d'écran, palier par palier.
 */
@OptIn(ExperimentalLayoutApi::class)
@Composable
internal fun BadgeUpcomingView(guide: BadgeGuide, modifier: Modifier = Modifier) {
    val res = LocalContext.current.resources
    val locale = LocalConfiguration.current.locales[0]
    val tokens = MeeshyTheme.tokens
    val upcoming = guide.upcoming
    if (upcoming.isEmpty()) {
        Text(
            stringResource(R.string.game_badge_complete),
            modifier.fillMaxWidth(),
            style = MaterialTheme.typography.bodySmall,
            fontWeight = FontWeight.Medium,
            color = tokens.textMuted,
        )
        return
    }
    val title = stringResource(R.string.game_badge_upcoming_title)
    val spoken = remember(guide, res, locale) {
        (listOf(title) + upcoming.map { rungSpoken(res, locale, guide, it) }).joinToString(". ")
    }
    FlowRow(
        modifier.fillMaxWidth().clearAndSetSemantics { contentDescription = spoken },
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.xs),
        verticalArrangement = Arrangement.spacedBy(MeeshySpacing.xxs),
    ) {
        Text(
            title.uppercase(locale),
            Modifier.align(Alignment.CenterVertically),
            style = MaterialTheme.typography.labelSmall,
            fontWeight = FontWeight.SemiBold,
            color = tokens.textMuted,
            maxLines = 1,
        )
        upcoming.forEach { rung ->
            val next = guide.stateOf(rung) == BadgeRungState.Next
            Row(Modifier.align(Alignment.CenterVertically), horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.xxs), verticalAlignment = Alignment.CenterVertically) {
                MaterialSwatch(rung.material, lit = false, size = SWATCH_SMALL)
                Text(
                    stringResource(materialName(rung.material)) + " " + GameNumberFormat.formatCount(rung.threshold, locale),
                    style = MaterialTheme.typography.labelMedium,
                    fontWeight = if (next) FontWeight.SemiBold else FontWeight.Normal,
                    color = if (next) MeeshyPalette.Indigo500 else tokens.textMuted,
                    maxLines = 1,
                )
            }
        }
    }
}

private fun rungSpoken(res: Resources, locale: Locale, guide: BadgeGuide, rung: BadgeRung): String {
    val material = res.getString(materialName(rung.material))
    val threshold = GameNumberFormat.formatCount(rung.threshold, locale)
    return if (guide.stateOf(rung) == BadgeRungState.Next) {
        res.getString(R.string.game_badge_rung_a11y_next, material, threshold, GameNumberFormat.formatCount(guide.next?.missing ?: 0, locale))
    } else {
        res.getString(R.string.game_badge_rung_a11y_upcoming, material, threshold)
    }
}

/** La pastille de métal d'un palier : la matière, éteinte quand le palier est à venir. Décorative (iOS `GameBadgeSwatch`). */
@Composable
internal fun MaterialSwatch(material: BadgeMaterialKey, lit: Boolean, size: Dp) {
    val metal = material.toGameMaterial()
    val ring = MeeshyTheme.tokens.textMuted
    Canvas(Modifier.size(size)) {
        drawCircle(metal.brush(Rect(Offset.Zero, this.size)), alpha = if (lit) 1f else SWATCH_OFF_ALPHA)
        if (!lit) drawCircle(ring, radius = this.size.minDimension / 2f - SWATCH_RING.toPx() / 2f, style = Stroke(SWATCH_RING.toPx()))
    }
}

/**
 * LA PAGE DES MÉDAILLES (iOS `ProgressionSectionPage(.badges)`) : « Comprendre les médailles », puis les vingt axes par
 * famille — chacun sa ligne (médaille, nom, compteur, paliers, prochaine étape) et la SUITE de ses paliers. Une ligne
 * dont la médaille est gagnée se touche et s'ouvre en grand, en consultation, comme sur l'étagère.
 */
@Composable
internal fun BadgesSection(progress: EngagementProgress, game: GameBlock?, hidden: Boolean, onOpenGuide: () -> Unit) {
    var shown by remember { mutableStateOf<ProgressionRevealRequest?>(null) }
    val earned = remember(progress) { BadgeShelf.of(progress).flatMap { it.entries }.associateBy { it.axis } }
    BadgeGuideLink(onOpenGuide)
    progress.axesByFamily.forEach { group ->
        Column(verticalArrangement = Arrangement.spacedBy(MeeshySpacing.sm)) {
            FamilyHeading(group.family)
            ProgressionCardFrame {
                group.axes.forEachIndexed { index, axis ->
                    if (index > 0) RowDivider()
                    val entry = earned[axis.axis]
                    AxisRow(axis, entry, onOpen = entry?.let { { shown = it.request } })
                    BadgeUpcomingView(remember(axis) { BadgeGuideResolver.resolve(axis) }, Modifier.padding(bottom = MeeshySpacing.xs))
                }
            }
        }
    }
    ProgressionConsultation(shown, game, hidden, onDismiss = { shown = null })
}

@Composable
internal fun FamilyHeading(family: EngagementAxisFamily) {
    Text(
        stringResource(familyTitle(family)).uppercase(LocalConfiguration.current.locales[0]),
        Modifier.semantics { heading() },
        style = MaterialTheme.typography.labelSmall,
        fontWeight = FontWeight.SemiBold,
        color = MeeshyTheme.tokens.textMuted,
    )
}

/** La ligne d'un axe (iOS `ProgressionAxisRow`) : sa médaille, son nom et son compteur, ses paliers, la prochaine étape. */
@Composable
private fun AxisRow(axis: EngagementAxisProgress, earned: BadgeShelfEntry?, onOpen: (() -> Unit)?) {
    val res = LocalContext.current.resources
    val locale = LocalConfiguration.current.locales[0]
    val tokens = MeeshyTheme.tokens
    val title = remember(axis.axis, res) { RevealCopy.axisTitle(res, axis.axis) }
    val scale = axis.scale
    val nextStep = scale.nextThreshold?.let { next ->
        stringResource(R.string.progression_next_badge, scale.remainingToNext ?: 0, next)
    } ?: stringResource(R.string.progression_scale_complete)
    val value = GameNumberFormat.formatCount(scale.value, locale)
    val row: @Composable () -> Unit = {
        Row(
            Modifier
                .fillMaxWidth()
                .heightIn(min = 44.dp)
                .padding(vertical = MeeshySpacing.xs)
                .clearAndSetSemantics { contentDescription = "$title, $value, $nextStep" },
            horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.md),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            GameMedalView(
                family = GameMedalFamily.of(axis.family),
                glyph = GameMedalGlyph.of(axis.axis),
                material = (earned?.material ?: BadgeMaterialKey.CUIVRE).toGameMaterial(),
                state = if (earned?.lit == true) GameMedalState.Lit else GameMedalState.Imprint,
                progress = earned?.progress ?: 0.0,
                surface = tokens.backgroundSecondary,
                muted = tokens.textMuted,
                modifier = Modifier.width(AXIS_MEDAL_WIDTH),
            )
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(MeeshySpacing.xxs)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(title, Modifier.weight(1f), style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.SemiBold, color = tokens.textPrimary, maxLines = 1)
                    Text(value, style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.SemiBold, color = tokens.textMuted, maxLines = 1)
                }
                Row(verticalAlignment = Alignment.CenterVertically) {
                    TierDots(scale.tiers.map { it.reached })
                    Spacer(Modifier.weight(1f))
                    Text(nextStep, style = MaterialTheme.typography.labelSmall, fontWeight = FontWeight.Medium, color = tokens.textMuted, maxLines = 1)
                }
            }
        }
    }
    if (onOpen == null) row() else Box(Modifier.fillMaxWidth().bounceDoor(stringResource(R.string.progression_achievement_a11y_hint), onOpen)) { row() }
}

@Composable
private fun TierDots(reached: List<Boolean>) {
    Row(horizontalArrangement = Arrangement.spacedBy(3.dp), verticalAlignment = Alignment.CenterVertically) {
        reached.forEach { on ->
            Box(Modifier.size(6.dp).clip(CircleShape).background(MeeshyPalette.Indigo500.copy(alpha = if (on) 1f else DOT_OFF_ALPHA)))
        }
    }
}

/**
 * LA PAGE DES DÉFIS (iOS `ProgressionGeneratedAchievements`) : section par section, son titre et son compte, puis ses
 * paliers en GRILLE qui passe à la ligne — aucune rangée ne défile de côté. La vue ne trie, ne filtre, ne tronque rien :
 * la loi partagée l'a fait. Un palier se touche et s'ouvre en consultation.
 */
@Composable
internal fun ChallengesSection(progress: EngagementProgress, game: GameBlock?, hidden: Boolean) {
    var shown by remember { mutableStateOf<ProgressionRevealRequest?>(null) }
    progress.achievementSections.forEach { section ->
        ChallengeSectionView(section, onOpen = { shown = ChallengeRequest.of(it) })
    }
    ProgressionConsultation(shown, game, hidden, onDismiss = { shown = null })
}

@Composable
private fun ChallengeSectionView(section: AchievementSectionView, onOpen: (AchievementEntry) -> Unit) {
    val res = LocalContext.current.resources
    val locale = LocalConfiguration.current.locales[0]
    val tokens = MeeshyTheme.tokens
    Column(verticalArrangement = Arrangement.spacedBy(MeeshySpacing.sm)) {
        Row(Modifier.semantics(mergeDescendants = true) { heading() }, verticalAlignment = Alignment.CenterVertically) {
            Text(RevealCopy.sectionName(res, section.section), Modifier.weight(1f), style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.SemiBold, color = tokens.textPrimary)
            Text(
                stringResource(R.string.game_concept_ratio, GameNumberFormat.formatCount(section.unlockedCount, locale), GameNumberFormat.formatCount(section.attainableCount, locale)),
                style = MaterialTheme.typography.labelMedium,
                fontWeight = FontWeight.Medium,
                color = tokens.textMuted,
            )
        }
        BoxWithConstraints(Modifier.fillMaxWidth()) {
            val columns = ((maxWidth + MeeshySpacing.sm) / (CHIP_MIN_WIDTH + MeeshySpacing.sm)).toInt().coerceAtLeast(1)
            Column(verticalArrangement = Arrangement.spacedBy(MeeshySpacing.sm)) {
                section.entries.chunked(columns).forEach { line ->
                    Row(horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.sm)) {
                        line.forEach { entry -> ChallengeChip(entry, Modifier.weight(1f), onOpen = { onOpen(entry) }) }
                        repeat(columns - line.size) { Spacer(Modifier.weight(1f)) }
                    }
                }
            }
        }
    }
}

@Composable
private fun ChallengeChip(entry: AchievementEntry, modifier: Modifier, onOpen: () -> Unit) {
    val res = LocalContext.current.resources
    val locale = LocalConfiguration.current.locales[0]
    val tokens = MeeshyTheme.tokens
    val label = remember(entry, res, locale) { RevealCopy.title(res, locale, RevealTitle.Composed(entry.family, entry.tier)) }
    val shape = RoundedCornerShape(MeeshyRadius.md)
    Box(modifier.bounceDoor(stringResource(R.string.progression_achievement_a11y_hint), onOpen)) {
        Column(
            Modifier
                .fillMaxWidth()
                .heightIn(min = 44.dp)
                .clip(shape)
                .background(if (entry.unlocked) MeeshyPalette.Success.copy(alpha = CHIP_EARNED_ALPHA) else tokens.textMuted.copy(alpha = CHIP_LOCKED_ALPHA))
                .padding(MeeshySpacing.sm),
            verticalArrangement = Arrangement.spacedBy(MeeshySpacing.xs),
        ) {
            Icon(
                if (entry.unlocked) MeeshyIcons.StarFilled else MeeshyIcons.Trophy,
                contentDescription = null,
                tint = if (entry.unlocked) MeeshyPalette.Success else tokens.textMuted,
                modifier = Modifier.size(14.dp),
            )
            Text(label, style = MaterialTheme.typography.labelLarge, fontWeight = FontWeight.SemiBold, color = tokens.textPrimary)
            if (entry.unlocked) {
                Text(stringResource(R.string.game_detail_earned), style = MaterialTheme.typography.labelSmall, fontWeight = FontWeight.Medium, color = tokens.textMuted)
            }
        }
    }
}

@StringRes
internal fun familyTitle(family: EngagementAxisFamily): Int = when (family) {
    EngagementAxisFamily.CONTENT -> R.string.progression_family_content
    EngagementAxisFamily.COMMENT -> R.string.progression_family_comment
    EngagementAxisFamily.CONVERSATION -> R.string.progression_family_conversation
    EngagementAxisFamily.TOOL -> R.string.progression_family_tool
    EngagementAxisFamily.SOCIAL -> R.string.progression_family_social
}

@StringRes
internal fun materialName(material: BadgeMaterialKey): Int = when (material) {
    BadgeMaterialKey.CUIVRE -> R.string.game_material_copper
    BadgeMaterialKey.BRONZE -> R.string.game_material_bronze
    BadgeMaterialKey.ARGENT -> R.string.game_material_silver
    BadgeMaterialKey.OR -> R.string.game_material_gold
    BadgeMaterialKey.PLATINE -> R.string.game_material_platinum
    BadgeMaterialKey.OBSIDIENNE -> R.string.game_material_obsidian
    BadgeMaterialKey.PRISME -> R.string.game_material_prism
}

/** Ce qui compte pour une médaille, en une phrase (iOS `ProgressionCopy.whatCounts`). */
@StringRes
internal fun axisCounts(axis: EngagementAxisKey): Int = when (axis) {
    EngagementAxisKey.AUDIO_MESSAGE -> R.string.progression_axis_content_audio_message_counts
    EngagementAxisKey.TEXT_MESSAGE -> R.string.progression_axis_content_text_message_counts
    EngagementAxisKey.POST -> R.string.progression_axis_content_post_counts
    EngagementAxisKey.STORY -> R.string.progression_axis_content_story_counts
    EngagementAxisKey.REEL -> R.string.progression_axis_content_reel_counts
    EngagementAxisKey.AUDIO_COMMENT -> R.string.progression_axis_comment_audio_counts
    EngagementAxisKey.TEXT_COMMENT -> R.string.progression_axis_comment_text_counts
    EngagementAxisKey.PRIVATE_CONVERSATION -> R.string.progression_axis_conversation_private_counts
    EngagementAxisKey.PUBLIC_CONVERSATION -> R.string.progression_axis_conversation_public_counts
    EngagementAxisKey.COMMUNITY_CONVERSATION -> R.string.progression_axis_conversation_community_counts
    EngagementAxisKey.GROUP_CREATED -> R.string.progression_axis_conversation_group_created_counts
    EngagementAxisKey.STICKER -> R.string.progression_axis_tool_sticker_counts
    EngagementAxisKey.IN_APP_EDIT -> R.string.progression_axis_tool_in_app_edit_counts
    EngagementAxisKey.DIRECT_PUBLISH -> R.string.progression_axis_tool_direct_publish_counts
    EngagementAxisKey.REACTION -> R.string.progression_axis_tool_reaction_counts
    EngagementAxisKey.ATTACHMENT -> R.string.progression_axis_tool_attachment_counts
    EngagementAxisKey.TRACKED_LINK -> R.string.progression_axis_social_tracked_link_counts
    EngagementAxisKey.SHARE -> R.string.progression_axis_social_share_counts
    EngagementAxisKey.INVITE_JOINED -> R.string.progression_axis_social_invite_joined_counts
    EngagementAxisKey.FRIENDSHIP -> R.string.progression_axis_social_friendship_counts
}

private val SWATCH_SMALL = 10.dp
private val SWATCH_RING = 1.5.dp
private const val SWATCH_OFF_ALPHA = 0.35f
private val AXIS_MEDAL_WIDTH = 40.dp
private const val DOT_OFF_ALPHA = 0.2f
private val CHIP_MIN_WIDTH = 132.dp
private const val CHIP_EARNED_ALPHA = 0.14f
private const val CHIP_LOCKED_ALPHA = 0.08f
