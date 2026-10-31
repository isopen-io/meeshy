package me.meeshy.app.game.progression

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.ui.layout.positionInParent
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import me.meeshy.app.game.reveal.RevealCopy
import me.meeshy.app.game.reveal.toGameMaterial
import me.meeshy.feature.game.R
import me.meeshy.sdk.model.game.GameNumberFormat
import me.meeshy.sdk.model.game.engagement.BadgeGuideFamilyGroup
import me.meeshy.sdk.model.game.engagement.BadgeGuideResolver
import me.meeshy.sdk.model.game.engagement.GameBadgeTiers
import me.meeshy.ui.accessibility.LocalReduceMotion
import me.meeshy.ui.component.game.GameMedalFamily
import me.meeshy.ui.component.game.GameMedalGlyph
import me.meeshy.ui.component.game.GameMedalView
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshyRadius
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

/** Les sections du carnet des règles qu'une entrée peut viser (iOS `GameRulesSection`) ; sans section, il s'ouvre en haut. */
enum class GameRulesSection(val wire: String) {
    Badges("badges"),
    ;

    companion object {
        fun fromWire(value: String?): GameRulesSection? = entries.firstOrNull { it.wire == value }
    }
}

/**
 * « COMMENT ÇA MARCHE » (iOS `GameRulesPage`) — le carnet des règles : Mee et Meo, les huit règles, chaque concept en
 * clair, les médailles, l'atlas illustré (paliers, Meesh, trésor, blasons, Flammes, ligues, médailles, trophées, raretés),
 * puis les sept étapes de l'intégration. Une page qui EXPLIQUE, sans geste ni lecture réseau :
 * elle s'ouvre instantanément, hors ligne comme en ligne, et ne se tire pas pour rafraîchir. Ouverte à une section
 * ([focused]), elle y défile ; sans section, elle s'ouvre en haut.
 */
@Composable
fun GameRulesScreen(onBack: () -> Unit, focused: GameRulesSection? = null) {
    val scroll = rememberScrollState()
    val reduceMotion = LocalReduceMotion.current
    var topY by remember { mutableStateOf<Float?>(null) }
    var badgesY by remember { mutableStateOf<Float?>(null) }
    var focusDone by remember { mutableStateOf(false) }
    LaunchedEffect(focused, topY, badgesY) {
        if (focusDone) return@LaunchedEffect
        val top = topY ?: return@LaunchedEffect
        val target = when (focused) {
            GameRulesSection.Badges -> badgesY
            null -> null
        } ?: return@LaunchedEffect
        val offset = (target - top).toInt().coerceAtLeast(0)
        if (reduceMotion) scroll.scrollTo(offset) else scroll.animateScrollTo(offset)
        focusDone = true
    }
    GamePageScaffold(
        title = stringResource(R.string.game_rules_page_title),
        onBack = onBack,
        isRefreshing = false,
        onRefresh = null,
        scroll = scroll,
    ) {
        RulesIntro(Modifier.onGloballyPositioned { topY = it.positionInParent().y })
        RulesList(Modifier.padding(top = MeeshySpacing.md))
        RulesGlossary(Modifier.padding(top = MeeshySpacing.md))
        Box(Modifier.padding(top = MeeshySpacing.md).onGloballyPositioned { badgesY = it.positionInParent().y }) {
            RulesBadgesSection()
        }
        RulesAtlas(Modifier.padding(top = MeeshySpacing.md))
        RulesSteps(Modifier.padding(top = MeeshySpacing.md))
    }
}

/**
 * LA SECTION MÉDAILLES DU CARNET (iOS `GameRulesBadgesSection`) : ce qu'est une médaille (UN geste compté), les sept
 * matières et leurs seuils, le ruban dès l'Or, l'empreinte d'une médaille éteinte, et les vingt médailles par famille,
 * chacune avec SON pictogramme et ce qui compte pour elle — tirés de la loi partagée, jamais recopiés.
 */
@Composable
internal fun RulesBadgesSection() {
    val tokens = MeeshyTheme.tokens
    Column(Modifier.fillMaxWidth().testTag(RULES_BADGES_TAG), verticalArrangement = Arrangement.spacedBy(MeeshySpacing.sm)) {
        Text(
            stringResource(R.string.game_rules_badges_title),
            Modifier.semantics { heading() },
            style = MaterialTheme.typography.titleLarge,
            fontWeight = FontWeight.Bold,
            color = tokens.textPrimary,
        )
        Paragraph(stringResource(R.string.game_rules_badges_intro), muted = false)
        Paragraph(stringResource(R.string.game_rules_badges_ladder), muted = false)
        RulesMaterials()
        Paragraph(stringResource(R.string.game_rules_badges_ribbon), muted = true)
        Paragraph(stringResource(R.string.game_rules_badges_imprint), muted = true)
        Text(
            stringResource(R.string.game_rules_badges_families),
            Modifier.semantics { heading() }.padding(top = MeeshySpacing.xs),
            style = MaterialTheme.typography.bodyLarge,
            fontWeight = FontWeight.Bold,
            color = tokens.textPrimary,
        )
        BadgeGuideResolver.catalog.forEach { group -> RulesFamily(group) }
        Paragraph(stringResource(R.string.game_rules_badges_sheet), muted = true)
    }
}

@Composable
private fun Paragraph(text: String, muted: Boolean) {
    Text(text, style = MaterialTheme.typography.bodyMedium, color = if (muted) MeeshyTheme.tokens.textMuted else MeeshyTheme.tokens.textPrimary)
}

/** Les sept matières, du cuivre au prisme : le nom, autant d'étoiles que le rang, le seuil — lus en une phrase. */
@Composable
private fun RulesMaterials() {
    val tokens = MeeshyTheme.tokens
    val locale = LocalConfiguration.current.locales[0]
    val max = GameBadgeTiers.materials.size
    Column(
        Modifier.fillMaxWidth().clip(RoundedCornerShape(MeeshyRadius.md)).background(tokens.backgroundSecondary).padding(MeeshySpacing.md),
        verticalArrangement = Arrangement.spacedBy(MeeshySpacing.xs),
    ) {
        GameBadgeTiers.materials.forEachIndexed { index, entry ->
            val name = stringResource(materialName(entry.key))
            val threshold = GameNumberFormat.formatCount(entry.threshold, locale)
            val spoken = listOf(
                name,
                stringResource(R.string.game_badge_rung_upcoming, threshold),
                stringResource(R.string.game_badge_a11y_stars, GameNumberFormat.formatCount(index + 1, locale), GameNumberFormat.formatCount(max, locale)),
            ).joinToString(", ")
            Row(
                Modifier.fillMaxWidth().clearAndSetSemantics { contentDescription = spoken },
                horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.md),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                MaterialSwatch(entry.key, lit = true, size = 20.dp)
                Text(name, style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.SemiBold, color = tokens.textPrimary)
                Spacer(Modifier.weight(1f))
                Text("★".repeat(index + 1), style = MaterialTheme.typography.labelSmall, color = MeeshyPalette.Indigo500, maxLines = 1)
                Text(threshold, style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.SemiBold, color = tokens.textPrimary)
            }
        }
    }
}

@Composable
private fun RulesFamily(group: BadgeGuideFamilyGroup) {
    val tokens = MeeshyTheme.tokens
    val res = LocalContext.current.resources
    Column(verticalArrangement = Arrangement.spacedBy(MeeshySpacing.xs)) {
        FamilyHeading(group.family)
        Column(
            Modifier.fillMaxWidth().clip(RoundedCornerShape(MeeshyRadius.md)).background(tokens.backgroundSecondary).padding(MeeshySpacing.md),
            verticalArrangement = Arrangement.spacedBy(MeeshySpacing.sm),
        ) {
            group.guides.forEach { guide ->
                Row(
                    Modifier.fillMaxWidth().semantics(mergeDescendants = true) {},
                    horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.md),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    GameMedalView(
                        family = GameMedalFamily.of(guide.family),
                        glyph = GameMedalGlyph.of(guide.axis),
                        material = guide.rungs.first().material.toGameMaterial(),
                        progress = 0.0,
                        surface = tokens.backgroundSecondary,
                        muted = tokens.textMuted,
                        modifier = Modifier.width(36.dp),
                    )
                    Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                        Text(RevealCopy.axisTitle(res, guide.axis), style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.SemiBold, color = tokens.textPrimary)
                        Text(stringResource(axisCounts(guide.axis)), style = MaterialTheme.typography.bodySmall, color = tokens.textMuted)
                    }
                }
            }
        }
    }
}

internal const val RULES_BADGES_TAG = "game.rules.badges"
