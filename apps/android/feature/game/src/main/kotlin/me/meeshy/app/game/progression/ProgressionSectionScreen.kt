package me.meeshy.app.game.progression

import androidx.annotation.StringRes
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.foundation.background
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import me.meeshy.app.game.pages.rememberGameHidden
import me.meeshy.feature.game.R
import me.meeshy.sdk.model.game.engagement.EngagementProgress
import me.meeshy.sdk.model.game.progression.ProgressionConcept
import me.meeshy.sdk.model.game.progression.ProgressionNotice
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshySpacing

/**
 * Les sous-pages de SECTION d'une fiche (iOS `ProgressionSection`) : leur parent est la fiche de leur concept, le retour
 * y ramène. Médailles, Défis, Succès — l'ordre d'iOS.
 */
enum class ProgressionSection(val wire: String, val concept: ProgressionConcept) {
    Badges("badges", ProgressionConcept.Badges),
    Defis("defis", ProgressionConcept.Defis),
    Succes("succes", ProgressionConcept.Succes),
    ;

    /** Le compte de l'en-tête (iOS `ProgressionSectionPage.compte`) : ce qui est obtenu, sur ce qui peut l'être. */
    fun count(progress: EngagementProgress): SectionCount = when (this) {
        Badges -> SectionCount(progress.badgesEarned, progress.badgesTotal)
        Defis -> SectionCount(progress.achievementSections.sumOf { it.unlockedCount }, progress.achievementSections.sumOf { it.attainableCount })
        Succes -> SectionCount(progress.unlockedAchievementCount, progress.achievements.size)
    }

    companion object {
        fun fromWire(value: String?): ProgressionSection? = entries.firstOrNull { it.wire == value }

        /** « Aller plus loin » d'une fiche : la section dont elle est le parent. */
        fun of(concept: ProgressionConcept): List<ProgressionSection> = entries.filter { it.concept == concept }
    }
}

data class SectionCount(val done: Int, val total: Int)

/**
 * UNE PAGE DE SECTION (iOS `ProgressionSectionPage`) — Médailles, Défis ou Hauts faits. AUTONOME dans la pile : elle lit
 * sa propre progression, cache d'abord, et n'ajoute aucun spinner. La valeur de l'en-tête, à la teinte de la section,
 * dit ce qui est obtenu sur ce qui peut l'être ; chaque palier se touche et s'ouvre en grand, en consultation.
 * « Comprendre les badges » mène au carnet des règles ([onOpenBadgesGuide]).
 */
@Composable
fun ProgressionSectionScreen(
    section: ProgressionSection,
    onBack: () -> Unit,
    onOpenBadgesGuide: () -> Unit = {},
    viewModel: ProgressionViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    val snapshot = state.snapshot
    val hidden = rememberGameHidden()
    val tint = sectionTint(section)
    GamePageScaffold(
        title = stringResource(sectionTitle(section)),
        onBack = onBack,
        isRefreshing = state.isRefreshing,
        onRefresh = viewModel::refresh,
        trailing = {
            snapshot?.progress?.let { progress ->
                val count = section.count(progress)
                Text(
                    stringResource(R.string.game_concept_ratio, count.done.toString(), count.total.toString()),
                    Modifier
                        .clip(CircleShape)
                        .background(tint.copy(alpha = COUNT_ALPHA))
                        .padding(horizontal = MeeshySpacing.md, vertical = MeeshySpacing.xs),
                    style = MaterialTheme.typography.bodyLarge,
                    fontWeight = FontWeight.Bold,
                    color = tint,
                    maxLines = 1,
                )
            }
        },
    ) {
        state.plan.notices.filterNot { it == ProgressionNotice.Empty }
            .forEach { notice -> ProgressionNoticeView(notice, onRetry = viewModel::refresh) }
        if (state.plan.showsSkeleton) ProgressionSkeleton()
        if (snapshot != null) {
            when (section) {
                ProgressionSection.Badges -> BadgesSection(snapshot.progress, snapshot.game, hidden.hidden, onOpenBadgesGuide)
                ProgressionSection.Defis -> ChallengesSection(snapshot.progress, snapshot.game, hidden.hidden)
                ProgressionSection.Succes -> AchievementList(snapshot.progress, snapshot.game, hidden.hidden)
            }
        }
    }
}

@StringRes
private fun sectionTitle(section: ProgressionSection): Int = when (section) {
    ProgressionSection.Badges -> R.string.progression_section_badges
    ProgressionSection.Defis -> R.string.achievement_header
    ProgressionSection.Succes -> R.string.progression_section_achievements
}

/** La teinte de la section (iOS `ProgressionSectionPage.teinte`) : indigo, ambre, vert. */
private fun sectionTint(section: ProgressionSection): Color = when (section) {
    ProgressionSection.Badges -> MeeshyPalette.Indigo500
    ProgressionSection.Defis -> MeeshyPalette.Warning
    ProgressionSection.Succes -> MeeshyPalette.Success
}

/** Le titre du lien « Aller plus loin » vers une section (iOS `ConceptText.linkBadges` / `linkDefis` / `linkSucces`). */
@StringRes
internal fun sectionLinkTitle(section: ProgressionSection): Int = when (section) {
    ProgressionSection.Badges -> R.string.game_concept_link_badges
    ProgressionSection.Defis -> R.string.game_concept_link_defis
    ProgressionSection.Succes -> R.string.game_concept_link_succes
}

private const val COUNT_ALPHA = 0.18f
