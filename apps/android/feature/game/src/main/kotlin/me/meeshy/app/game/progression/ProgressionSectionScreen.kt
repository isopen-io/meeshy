package me.meeshy.app.game.progression

import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.foundation.background
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import me.meeshy.app.game.pages.rememberGameHidden
import me.meeshy.feature.game.R
import me.meeshy.sdk.model.game.progression.ProgressionConcept
import me.meeshy.sdk.model.game.progression.ProgressionNotice
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshySpacing

/**
 * Les sous-pages de SECTION d'une fiche (iOS `ProgressionSection`) : leur parent est la fiche de leur concept, le retour
 * y ramène. Seule la page des hauts faits est portée ici ; Badges et Défis suivent.
 */
enum class ProgressionSection(val wire: String, val concept: ProgressionConcept) {
    Succes("succes", ProgressionConcept.Succes),
    ;

    companion object {
        fun fromWire(value: String?): ProgressionSection? = entries.firstOrNull { it.wire == value }

        /** « Aller plus loin » d'une fiche : la section dont elle est le parent. */
        fun of(concept: ProgressionConcept): List<ProgressionSection> = entries.filter { it.concept == concept }
    }
}

/**
 * LA PAGE DES HAUTS FAITS (iOS `ProgressionSectionPage(.succes)`) — AUTONOME dans la pile : elle lit sa propre
 * progression, cache d'abord, et n'ajoute aucun spinner. Chaque haut fait se touche et s'ouvre en grand, en
 * consultation ; la valeur de l'en-tête dit combien sont obtenus.
 */
@Composable
fun ProgressionSectionScreen(
    section: ProgressionSection,
    onBack: () -> Unit,
    viewModel: ProgressionViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    val snapshot = state.snapshot
    val hidden = rememberGameHidden()
    GamePageScaffold(
        title = stringResource(sectionTitle(section)),
        onBack = onBack,
        isRefreshing = state.isRefreshing,
        onRefresh = viewModel::refresh,
        trailing = {
            snapshot?.progress?.let { progress ->
                Text(
                    stringResource(R.string.game_concept_ratio, progress.unlockedAchievementCount.toString(), progress.achievements.size.toString()),
                    Modifier
                        .clip(CircleShape)
                        .background(MeeshyPalette.Success.copy(alpha = COUNT_ALPHA))
                        .padding(horizontal = MeeshySpacing.md, vertical = MeeshySpacing.xs),
                    style = MaterialTheme.typography.bodyLarge,
                    fontWeight = FontWeight.Bold,
                    color = MeeshyPalette.Success,
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
                ProgressionSection.Succes -> AchievementList(snapshot.progress, snapshot.game, hidden.hidden)
            }
        }
    }
}

private fun sectionTitle(section: ProgressionSection): Int = when (section) {
    ProgressionSection.Succes -> R.string.progression_section_achievements
}

/** Le titre du lien « Aller plus loin » vers une section (iOS `ConceptText.linkSucces`). */
internal fun sectionLinkTitle(section: ProgressionSection): Int = when (section) {
    ProgressionSection.Succes -> R.string.game_concept_link_succes
}

private const val COUNT_ALPHA = 0.18f
