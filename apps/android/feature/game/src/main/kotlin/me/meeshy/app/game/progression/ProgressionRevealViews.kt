package me.meeshy.app.game.progression

import android.content.res.Resources
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.key
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.composed
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import java.util.Locale
import me.meeshy.app.game.reveal.AchievementRevealScreen
import me.meeshy.app.game.reveal.RevealCopy
import me.meeshy.app.game.reveal.rarityRim
import me.meeshy.app.game.reveal.toGameMaterial
import me.meeshy.feature.game.R
import me.meeshy.sdk.model.game.GameBlock
import me.meeshy.sdk.model.game.GameNumberFormat
import me.meeshy.sdk.model.game.engagement.BadgeMaterialKey
import me.meeshy.sdk.model.game.engagement.EngagementAxisFamily
import me.meeshy.sdk.model.game.engagement.EngagementProgress
import me.meeshy.sdk.model.game.engagement.EngagementRevealPlan
import me.meeshy.sdk.model.game.engagement.RevealRim
import me.meeshy.sdk.model.game.engagement.RevealSubtitle
import me.meeshy.sdk.model.game.engagement.RevealTitle
import me.meeshy.sdk.model.game.progression.ProgressionConcept
import me.meeshy.ui.component.game.gameBounce
import me.meeshy.ui.haptics.rememberMeeshyHaptics
import me.meeshy.ui.component.game.GameMedalFamily
import me.meeshy.ui.component.game.GameMedalGlyph
import me.meeshy.ui.component.game.GameMedalState
import me.meeshy.ui.component.game.GameMedalView
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshyRadius
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

/** Le concept porte-t-il, dans « À toi de jouer », une porte vers ses paliers (iOS `ProgressionConceptGestures.exist`) ? */
internal fun conceptHasRevealPiece(concept: ProgressionConcept): Boolean =
    concept == ProgressionConcept.Badges || concept == ProgressionConcept.Succes

/**
 * LA PIÈCE D'UNE FICHE QUI OUVRE SES PALIERS — l'étagère des médailles (Badges), le héros du dernier haut fait (Succès).
 * Une médaille ouvre sa FEUILLE DE PRÉCISIONS (iOS `GameElementSheet`) ; un haut fait, sa révélation en CONSULTATION :
 * on arrive depuis la fiche, la célébration n'a nulle part où « mener ».
 */
@Composable
internal fun ConceptRevealPiece(
    concept: ProgressionConcept,
    progress: EngagementProgress,
    game: GameBlock?,
    hidden: Boolean,
    onOpenBadgesGuide: (() -> Unit)? = null,
) {
    var shown by remember { mutableStateOf<ProgressionRevealRequest?>(null) }
    var detail by remember { mutableStateOf<GameElementDetail?>(null) }
    when (concept) {
        ProgressionConcept.Badges -> BadgeShelfView(
            remember(progress) { BadgeShelf.of(progress) },
            onOpen = { detail = GameElementDetails.badge(it) },
            onOpenGuide = onOpenBadgesGuide,
        )
        ProgressionConcept.Succes -> AchievementHeroCard(remember(progress) { AchievementHero.of(progress) }, onOpen = { shown = it })
        else -> Unit
    }
    ProgressionConsultation(shown, game, hidden, onDismiss = { shown = null })
    detail?.let { GameElementSheet(it, onDismiss = { detail = null }, onOpenBadgesGuide = onOpenBadgesGuide) }
}

/** La liste des hauts faits (iOS `ProgressionSectionPage(.succes)`) : chaque ligne rebondit et ouvre SA révélation. */
@Composable
internal fun AchievementList(progress: EngagementProgress, game: GameBlock?, hidden: Boolean) {
    var shown by remember { mutableStateOf<ProgressionRevealRequest?>(null) }
    val rows = remember(progress, game, hidden) { AchievementRow.of(progress, game?.achievementRarities, hidden) }
    ProgressionCardFrame {
        rows.forEachIndexed { index, row ->
            if (index > 0) RowDivider()
            AchievementListRow(row, onOpen = { shown = row.request })
        }
    }
    ProgressionConsultation(shown, game, hidden, onDismiss = { shown = null })
}

/** La révélation d'un palier CONSULTÉ, avec le liseré de sa rareté mesurée — « Jeu masqué » le retire. */
@Composable
internal fun ProgressionConsultation(request: ProgressionRevealRequest?, game: GameBlock?, hidden: Boolean, onDismiss: () -> Unit) {
    val current = request ?: return
    key(current) {
        AchievementRevealScreen(
            reveal = current.reveal,
            onContinue = onDismiss,
            occasion = current.occasion,
            rarity = RevealRim.entry(current.reveal, game?.achievementRarities, hidden),
        )
    }
}

@Composable
private fun AchievementHeroCard(hero: AchievementHero, onOpen: (ProgressionRevealRequest) -> Unit) {
    val res = LocalContext.current.resources
    val locale = LocalConfiguration.current.locales[0]
    val tokens = MeeshyTheme.tokens
    val obtained = hero is AchievementHero.Obtained
    val tint = if (obtained) MeeshyPalette.Success else tokens.textMuted
    val banner = stringResource(
        when (hero) {
            is AchievementHero.Obtained -> R.string.progression_hero_last
            is AchievementHero.Next -> R.string.progression_hero_next
            AchievementHero.First -> R.string.progression_hero_first
        },
    )
    val (title, line) = remember(hero, res, locale) { heroTexts(res, locale, hero) }
    val hint = stringResource(R.string.progression_hero_reveal_hint)
    val shape = RoundedCornerShape(MeeshyRadius.lg)
    val card: @Composable () -> Unit = {
        Row(
            Modifier
                .fillMaxWidth()
                .clip(shape)
                .background(tint.copy(alpha = HERO_FILL_ALPHA))
                .border(1.dp, tint.copy(alpha = HERO_STROKE_ALPHA), shape)
                .padding(MeeshySpacing.lg),
            horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.md),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Box(
                Modifier.size(48.dp).clip(RoundedCornerShape(MeeshyRadius.md)).background(tint.copy(alpha = HERO_ICON_ALPHA)),
                contentAlignment = Alignment.Center,
            ) {
                Icon(MeeshyIcons.Trophy, contentDescription = null, tint = tint, modifier = Modifier.size(22.dp))
            }
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(MeeshySpacing.xxs)) {
                Text(banner.uppercase(locale), style = MaterialTheme.typography.labelSmall, fontWeight = FontWeight.SemiBold, color = tokens.textMuted)
                Text(title, style = MaterialTheme.typography.bodyLarge, fontWeight = FontWeight.Bold, color = tokens.textPrimary)
                line?.let { Text(it, style = MaterialTheme.typography.bodySmall, color = tokens.textMuted) }
            }
        }
    }
    val request = hero.request
    val door = if (request == null) Modifier.semantics(mergeDescendants = true) {} else Modifier.bounceDoor(hint) { onOpen(request) }
    Box(door) { card() }
}

private fun heroTexts(res: Resources, locale: Locale, hero: AchievementHero): Pair<String, String?> = when (hero) {
    is AchievementHero.Obtained -> RevealCopy.title(res, locale, hero.title) to RevealCopy.obtained(res, locale, hero.reachedAt)
    is AchievementHero.Next -> {
        val plan = EngagementRevealPlan.of(hero.request.reveal, hero.request.occasion)
        RevealCopy.title(res, locale, plan.title) to RevealCopy.subtitle(res, plan.subtitle)
    }
    AchievementHero.First -> res.getString(R.string.progression_hero_first_hint) to null
}

@Composable
private fun AchievementListRow(row: AchievementRow, onOpen: () -> Unit) {
    val res = LocalContext.current.resources
    val locale = LocalConfiguration.current.locales[0]
    val tokens = MeeshyTheme.tokens
    val unlocked = row.achievement.unlocked
    val tint = if (unlocked) MeeshyPalette.Success else tokens.textMuted
    val title = RevealCopy.title(res, locale, RevealTitle.Legacy(row.achievement.key))
    val line = if (unlocked) {
        RevealCopy.obtained(res, locale, row.achievement.reachedAt) ?: stringResource(R.string.progression_unlocked)
    } else {
        RevealCopy.subtitle(res, RevealSubtitle.LegacyCondition(row.achievement.key))
    }
    val rarityLine = remember(row.rarity) { RevealRim.line(row.rarity) }
    val hint = stringResource(R.string.progression_achievement_a11y_hint)
    val shape = RoundedCornerShape(MeeshyRadius.sm)
    Box(Modifier.fillMaxWidth().bounceDoor(hint, onOpen)) {
        Row(
            Modifier
                .fillMaxWidth()
                .heightIn(min = 44.dp)
                .rarityRim(RevealRim.border(row.rarity), shape)
                .padding(vertical = MeeshySpacing.sm),
            horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.md),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Box(
                Modifier.size(36.dp).clip(shape).background(tint.copy(alpha = if (unlocked) ROW_ICON_ALPHA else ROW_ICON_LOCKED_ALPHA)),
                contentAlignment = Alignment.Center,
            ) {
                Icon(if (unlocked) MeeshyIcons.Trophy else MeeshyIcons.LockFilled, contentDescription = null, tint = tint, modifier = Modifier.size(16.dp))
            }
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(MeeshySpacing.xxs)) {
                Text(title, style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.SemiBold, color = if (unlocked) tokens.textPrimary else tokens.textMuted)
                Text(line, style = MaterialTheme.typography.bodySmall, fontWeight = FontWeight.Medium, color = tokens.textMuted)
                rarityLine?.let { Text(RevealCopy.rarityLine(res, locale, it), style = MaterialTheme.typography.labelSmall, color = tokens.textMuted) }
            }
        }
    }
}

/**
 * L'ÉTAGÈRE (iOS `GameBadgeShelfView`) : par famille, la médaille de chaque axe gagné, son nom, ses étoiles et la SUITE
 * de ses paliers à venir — puis « Comprendre les médailles » quand un carnet peut s'ouvrir. Avant le premier badge,
 * seul le lien.
 */
@Composable
private fun BadgeShelfView(groups: List<BadgeShelfGroup>, onOpen: (BadgeShelfEntry) -> Unit, onOpenGuide: (() -> Unit)?) {
    Column(verticalArrangement = Arrangement.spacedBy(MeeshySpacing.lg)) {
        groups.forEach { group ->
            Column(verticalArrangement = Arrangement.spacedBy(MeeshySpacing.sm)) {
                FamilyHeading(group.family)
                ProgressionCardFrame {
                    group.entries.forEachIndexed { index, entry ->
                        if (index > 0) RowDivider()
                        BadgeShelfRow(entry, onOpen = { onOpen(entry) })
                        BadgeUpcomingView(entry.guide)
                    }
                }
            }
        }
        onOpenGuide?.let { BadgeGuideLink(it) }
    }
}

@Composable
private fun BadgeShelfRow(entry: BadgeShelfEntry, onOpen: () -> Unit) {
    val res = LocalContext.current.resources
    val locale = LocalConfiguration.current.locales[0]
    val tokens = MeeshyTheme.tokens
    val axis = remember(entry.axis, res) { RevealCopy.axisTitle(res, entry.axis) }
    val stars = stringResource(R.string.game_concept_ratio, GameNumberFormat.formatCount(entry.stars, locale), GameNumberFormat.formatCount(BadgeShelfEntry.STARS_MAX, locale))
    val spoken = badgeSpoken(res, locale, entry, axis)
    Box(Modifier.fillMaxWidth().bounceDoor(stringResource(R.string.game_detail_open, axis), onOpen)) {
        Row(
            Modifier
                .fillMaxWidth()
                .heightIn(min = 44.dp)
                .clearAndSetSemantics { contentDescription = spoken },
            horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.md),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            GameMedalView(
                family = GameMedalFamily.of(entry.axis.family),
                glyph = GameMedalGlyph.of(entry.axis),
                material = entry.material.toGameMaterial(),
                state = if (entry.lit) GameMedalState.Lit else GameMedalState.Imprint,
                progress = entry.progress,
                label = if (entry.lit) GameNumberFormat.formatCount(entry.threshold, locale) else "−" + GameNumberFormat.formatCount(entry.missing, locale),
                surface = tokens.backgroundSecondary,
                muted = tokens.textMuted,
                modifier = Modifier.width(MEDAL_WIDTH),
            )
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(MeeshySpacing.xxs)) {
                Text(axis, style = MaterialTheme.typography.bodyLarge, fontWeight = FontWeight.SemiBold, color = tokens.textPrimary)
                Row(horizontalArrangement = Arrangement.spacedBy(2.dp), verticalAlignment = Alignment.CenterVertically) {
                    repeat(BadgeShelfEntry.STARS_MAX) { index ->
                        Icon(
                            MeeshyIcons.StarFilled,
                            contentDescription = null,
                            tint = MeeshyPalette.Indigo500.copy(alpha = if (index < entry.stars) 1f else STAR_OFF_ALPHA),
                            modifier = Modifier.size(12.dp),
                        )
                    }
                    Text(stars, Modifier.padding(start = MeeshySpacing.xxs), style = MaterialTheme.typography.labelSmall, fontWeight = FontWeight.SemiBold, color = tokens.textMuted)
                }
            }
        }
    }
}

/** Le badge en UNE phrase : l'axe, sa matière (ou ce qu'il manque pour le rallumer), ses étoiles. */
private fun badgeSpoken(res: Resources, locale: Locale, entry: BadgeShelfEntry, axis: String): String {
    val state = if (entry.lit) res.getString(materialName(entry.material)) else res.getString(R.string.game_badge_a11y_imprint, GameNumberFormat.formatCount(entry.missing, locale))
    val stars = res.getString(R.string.game_badge_a11y_stars, GameNumberFormat.formatCount(entry.stars, locale), GameNumberFormat.formatCount(BadgeShelfEntry.STARS_MAX, locale))
    return "$axis, $state, $stars"
}

/** La carte d'une liste de progression : fond secondaire, coins larges, lignes séparées d'un trait. */
@Composable
internal fun ProgressionCardFrame(content: @Composable () -> Unit) {
    Column(
        Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(MeeshyRadius.lg))
            .background(MeeshyTheme.tokens.backgroundSecondary)
            .padding(horizontal = MeeshySpacing.lg, vertical = MeeshySpacing.sm),
        verticalArrangement = Arrangement.spacedBy(MeeshySpacing.sm),
    ) { content() }
}

@Composable
internal fun RowDivider() {
    HorizontalDivider(color = MeeshyTheme.tokens.textMuted.copy(alpha = DIVIDER_ALPHA))
}

private val MEDAL_WIDTH = 64.dp
private const val HERO_FILL_ALPHA = 0.12f
private const val HERO_STROKE_ALPHA = 0.28f
private const val HERO_ICON_ALPHA = 0.22f
private const val ROW_ICON_ALPHA = 0.14f
private const val ROW_ICON_LOCKED_ALPHA = 0.10f
private const val STAR_OFF_ALPHA = 0.25f
private const val DIVIDER_ALPHA = 0.2f

/** Une porte du jeu : elle rebondit au toucher, tape légèrement, et dit au lecteur d'écran ce qu'elle ouvre. */
internal fun Modifier.bounceDoor(label: String?, onOpen: () -> Unit): Modifier = composed {
    val source = remember { MutableInteractionSource() }
    val haptics = rememberMeeshyHaptics()
    gameBounce(source).clickable(interactionSource = source, indication = null, onClickLabel = label, role = Role.Button) {
        haptics.light()
        onOpen()
    }
}
