package me.meeshy.app.game.progression

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import me.meeshy.feature.game.R
import me.meeshy.sdk.model.game.GameNumberFormat
import me.meeshy.sdk.model.game.rules.GameRulesBook
import me.meeshy.sdk.model.game.rules.GlossaryKey
import me.meeshy.sdk.model.game.rules.GuideFilms
import me.meeshy.sdk.model.game.rules.GuideSpeaker
import me.meeshy.sdk.model.game.rules.OnboardingStep
import me.meeshy.sdk.model.game.rules.OnboardingStepKey
import me.meeshy.ui.component.game.MeeFigure
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshyRadius
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

/** Mee salue, Meo fait signe, et la phrase entre eux dit ce que le carnet contient (iOS `GameRulesPage.intro`). */
@Composable
internal fun RulesIntro(modifier: Modifier = Modifier) {
    Row(modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.sm), verticalAlignment = Alignment.Bottom) {
        MeeFigure(filmId = INTRO_MEE_FILM, side = INTRO_SIDE, modifier = Modifier.clearAndSetSemantics {})
        Text(
            stringResource(R.string.game_rules_intro),
            Modifier.weight(1f),
            style = MaterialTheme.typography.bodyLarge,
            fontWeight = FontWeight.Medium,
            color = MeeshyTheme.tokens.textPrimary,
        )
        MeeFigure(filmId = INTRO_MEO_FILM, side = INTRO_SIDE, mirrored = true, modifier = Modifier.clearAndSetSemantics {})
    }
}

/** « Les règles en une page » (iOS `GameRulesPage.rules`) : huit règles numérotées, titre et phrase, lues d'un tenant. */
@Composable
internal fun RulesList(modifier: Modifier = Modifier) {
    val tokens = MeeshyTheme.tokens
    val locale = LocalConfiguration.current.locales[0]
    Column(modifier.fillMaxWidth().testTag(RULES_RULES_TAG), verticalArrangement = Arrangement.spacedBy(MeeshySpacing.sm)) {
        SectionTitle(stringResource(R.string.game_rules_section_rules))
        GameRulesBook.ruleIndices.forEach { index ->
            val copy = RulesBookCopy.rule(index)
            Row(
                Modifier.fillMaxWidth().padding(MeeshySpacing.xs).semantics(mergeDescendants = true) {}.testTag(rulesRuleTag(index)),
                horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.md),
                verticalAlignment = Alignment.Top,
            ) {
                Box(
                    Modifier.size(32.dp).clip(CircleShape).background(MeeshyPalette.Indigo500.copy(alpha = 0.16f)).clearAndSetSemantics {},
                    contentAlignment = Alignment.Center,
                ) {
                    Text(
                        GameNumberFormat.formatCount(index, locale),
                        style = MaterialTheme.typography.bodyLarge,
                        fontWeight = FontWeight.Bold,
                        color = MeeshyPalette.Indigo500,
                    )
                }
                Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                    Text(stringResource(copy.title), style = MaterialTheme.typography.bodyLarge, fontWeight = FontWeight.Bold, color = tokens.textPrimary)
                    Text(stringResource(copy.body), style = MaterialTheme.typography.bodyMedium, color = tokens.textMuted)
                }
            }
        }
    }
}

/**
 * « Chaque concept, en clair » (iOS `GameRulesGlossarySection`) : chaque concept de Progression et ce qui le complète,
 * un par un — ce que c'est, à quoi ça sert, comment ça se gagne. Aucune entrée ne porte de geste.
 */
@Composable
internal fun RulesGlossary(modifier: Modifier = Modifier) {
    val tokens = MeeshyTheme.tokens
    Column(modifier.fillMaxWidth().testTag(RULES_CONCEPTS_TAG), verticalArrangement = Arrangement.spacedBy(MeeshySpacing.sm)) {
        SectionTitle(stringResource(R.string.game_rules_section_concepts))
        Text(stringResource(R.string.game_rules_concepts_intro), style = MaterialTheme.typography.bodyMedium, color = tokens.textMuted)
        GameRulesBook.glossary.forEach { key ->
            Column(
                Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(MeeshyRadius.md))
                    .background(tokens.backgroundSecondary)
                    .padding(MeeshySpacing.md)
                    .semantics(mergeDescendants = true) {}
                    .testTag(rulesConceptTag(key)),
                verticalArrangement = Arrangement.spacedBy(2.dp),
            ) {
                Text(stringResource(RulesBookCopy.name(key)), style = MaterialTheme.typography.bodyLarge, fontWeight = FontWeight.Bold, color = tokens.textPrimary)
                Text(stringResource(RulesBookCopy.body(key)), style = MaterialTheme.typography.bodyMedium, color = tokens.textMuted)
            }
        }
    }
}

/** « Les sept étapes » (iOS `GameRulesPage.steps`) : les cartes de l'intégration en entier, avec qui les dit. */
@Composable
internal fun RulesSteps(modifier: Modifier = Modifier) {
    val locale = LocalConfiguration.current.locales[0]
    val total = GameNumberFormat.formatCount(GameRulesBook.onboardingSteps.size, locale)
    Column(modifier.fillMaxWidth().testTag(RULES_STEPS_TAG), verticalArrangement = Arrangement.spacedBy(MeeshySpacing.sm)) {
        SectionTitle(stringResource(R.string.game_rules_section_steps))
        GameRulesBook.onboardingSteps.forEach { step ->
            RulesStepCard(step, stringResource(R.string.game_guide_step_of, GameNumberFormat.formatCount(step.index, locale), total))
        }
    }
}

@Composable
private fun RulesStepCard(step: OnboardingStep, position: String) {
    val tokens = MeeshyTheme.tokens
    val copy = RulesBookCopy.step(step.key)
    Row(
        Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(MeeshyRadius.md))
            .background(tokens.backgroundSecondary)
            .padding(MeeshySpacing.md)
            .semantics(mergeDescendants = true) {}
            .testTag(rulesStepTag(step.key)),
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.md),
        verticalAlignment = Alignment.Top,
    ) {
        StepFigures(step)
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
            Text(position.uppercase(LocalConfiguration.current.locales[0]), style = MaterialTheme.typography.labelSmall, fontWeight = FontWeight.SemiBold, color = tokens.textMuted)
            Text(stringResource(copy.what), style = MaterialTheme.typography.bodyLarge, fontWeight = FontWeight.Bold, color = tokens.textPrimary)
            Text(stringResource(copy.means), style = MaterialTheme.typography.bodyMedium, color = tokens.textPrimary)
            Text(stringResource(copy.next), style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.SemiBold, color = tokens.textPrimary)
        }
    }
}

/** Les colibris d'une étape, fixes : un seul en grand, le duo en plus petit et serré (iOS `stepFigures`). */
@Composable
private fun StepFigures(step: OnboardingStep) {
    val films = GuideFilms.of(step.speaker, step.mood)
    val side = if (step.speaker == GuideSpeaker.Duo) 40.dp else 52.dp
    Row(Modifier.clearAndSetSemantics {}) {
        films.mee?.let { MeeFigure(filmId = it, side = side, animates = false) }
        films.meo?.let {
            val overlap = if (films.mee != null) Modifier.offset(x = (-6).dp) else Modifier
            MeeFigure(filmId = it, side = side, modifier = overlap, animates = false, mirrored = true)
        }
    }
}

@Composable
private fun SectionTitle(text: String) {
    Text(
        text,
        Modifier.semantics { heading() },
        style = MaterialTheme.typography.titleLarge,
        fontWeight = FontWeight.Bold,
        color = MeeshyTheme.tokens.textPrimary,
    )
}

private const val INTRO_MEE_FILM = "mee-bonjour"
private const val INTRO_MEO_FILM = "meo-salut"
private val INTRO_SIDE = 84.dp

internal const val RULES_RULES_TAG = "game.rules.section.rules"
internal const val RULES_CONCEPTS_TAG = "game.rules.section.concepts"
internal const val RULES_STEPS_TAG = "game.rules.section.steps"

internal fun rulesRuleTag(index: Int): String = "game.rules.rule.$index"

internal fun rulesConceptTag(key: GlossaryKey): String = "game.rules.concept.${key.wire}"

internal fun rulesStepTag(key: OnboardingStepKey): String = "game.rules.step.${key.wire}"
