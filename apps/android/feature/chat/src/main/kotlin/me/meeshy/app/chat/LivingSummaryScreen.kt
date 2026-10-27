package me.meeshy.app.chat

import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.derivedStateOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.produceState
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.foundation.clickable
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import java.time.Instant
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.withContext
import me.meeshy.feature.chat.R
import me.meeshy.sdk.model.reading.mode.ConversationReadingMode
import me.meeshy.sdk.model.reading.summary.LivingSummary
import me.meeshy.sdk.model.reading.summary.SummaryEntryAction
import me.meeshy.sdk.model.reading.summary.SummaryProtections
import me.meeshy.ui.accessibility.LocalReduceMotion
import me.meeshy.ui.theme.MeeshyFontSize
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

/** La place que le bouton « Reprendre le fil » réserve au bas du défilement. */
private val RESUME_BAND = 84.dp

/**
 * Le Résumé vivant — miroir de `LivingSummaryView` (iOS, contrat §WS-9). L'ÉTAT d'abord (le digest
 * en tête, rendu sans attendre l'agent), LA PREUVE à un tap (la rampe et les épisodes mènent aux
 * messages qui les prouvent). Deux étages jamais mélangés : le digest déterministe, calculé sur
 * l'appareil (hors ligne, en chiffré de bout en bout), puis le panneau de l'agent, à part.
 *
 * Posé EN SURCOUCHE du fil, qui reste composé dessous : revenir au Script ne perd ni la position
 * de défilement ni l'état de la liste. Le digest se calcule HORS du fil principal, une fois par
 * passage vide → peuplé (comme `.id(viewModel.messages.isEmpty)` iOS) ; la liste des messages
 * protégés, elle, est recomposée à chaque passe et son décompte tourne à la seconde.
 */
@Composable
internal fun LivingSummaryOverlay(
    host: ChatHostContext,
    topInset: Dp,
    bottomInset: Dp,
    modifier: Modifier = Modifier,
) {
    val readingMode = host.readingMode ?: return
    val binding = readingMode.summary
    val state = host.state
    val haptic = LocalHapticFeedback.current
    LaunchedEffect(binding) { binding.refreshAgent() }

    val viewer by binding.viewer.collectAsStateWithLifecycle()
    val agent by binding.agent.collectAsStateWithLifecycle()
    val bubbles = rememberUpdatedState(state.messages)
    val windowCoversUnread = rememberUpdatedState(!state.hasMoreOlder)
    val summary by produceState<LivingSummary?>(null, viewer, state.messages.isEmpty()) {
        val who = viewer ?: return@produceState
        if (bubbles.value.isEmpty()) return@produceState
        value = withContext(Dispatchers.Default) {
            LivingSummaryProjection.assemble(bubbles.value, who, windowCoversUnread.value)
        }
    }

    val facts = remember(state.messages) { LivingSummaryProjection.protectionFacts(state.messages) }
    val ticking = facts.any { it.isEphemeral }
    val clock = produceState(Instant.now(), ticking) {
        while (ticking) {
            delay(1_000)
            value = Instant.now()
        }
    }
    // La seconde qui passe n'est lue que par la section des protections : l'écran ne recompose
    // que lorsque la section apparaît ou disparaît.
    val protections = remember(facts) { derivedStateOf { SummaryProtections.entries(facts, clock.value) } }
    val hasProtections by remember(protections) { derivedStateOf { protections.value.isNotEmpty() } }

    val actions = host.actions
    val replyOffers = rememberUpdatedState(state)
    val showScript: () -> Unit = { readingMode.select(ConversationReadingMode.SCRIPT) }
    val offered: (String) -> List<SummaryEntryAction> = { messageId ->
        val bubble = replyOffers.value.messages.firstOrNull { it.messageId == messageId }
        SummaryEntryAction.offered(bubble?.let { MessageRowOffer.of(it, replyOffers.value.viewerMayWrite).canReply })
    }
    val run: (SummaryEntryAction, String) -> Unit = { action, messageId ->
        showScript()
        actions.scrollToMessage(messageId)
        if (action == SummaryEntryAction.REPLY && SummaryEntryAction.REPLY in offered(messageId)) {
            actions.startReply(messageId)
        }
    }
    val latestOffered = rememberUpdatedState(offered)
    val latestRun = rememberUpdatedState(run)
    val menu = remember { SummaryEntryMenu({ latestOffered.value(it) }, { action, id -> latestRun.value(action, id) }) }

    Box(
        modifier = modifier
            .fillMaxSize()
            .background(MeeshyTheme.tokens.backgroundPrimary),
    ) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .verticalScroll(rememberScrollState())
                .padding(horizontal = MeeshySpacing.lg)
                .padding(top = topInset + MeeshySpacing.xl, bottom = bottomInset + RESUME_BAND),
            verticalArrangement = Arrangement.spacedBy(MeeshySpacing.lg),
        ) {
            val digest = summary
            if (digest == null) {
                LivingSummarySkeleton()
            } else {
                var index = 0
                Reveal(index++) { SummaryHeader(digest.digest) }
                if (hasProtections) {
                    Reveal(index++) { SummaryProtectionsSection(protections.value) }
                }
                if (digest.faceRamp.isNotEmpty()) {
                    Reveal(index++) {
                        FaceRampSection(
                            entries = digest.faceRamp,
                            menu = menu,
                            onTap = { entry ->
                                haptic.performHapticFeedback(HapticFeedbackType.TextHandleMove)
                                val target = SummaryEntryAction.target(entry)
                                if (target == null) showScript() else run(SummaryEntryAction.REPLY, target)
                            },
                        )
                    }
                }
                if (digest.digest.episodes.isNotEmpty()) {
                    Reveal(index++) {
                        EpisodeSection(
                            episodes = digest.digest.episodes,
                            menu = menu,
                            onTap = { episode ->
                                haptic.performHapticFeedback(HapticFeedbackType.TextHandleMove)
                                val target = SummaryEntryAction.target(episode)
                                if (target == null) showScript() else run(SummaryEntryAction.GO_TO_MESSAGE, target)
                            },
                        )
                    }
                }
                agent.text?.let { text -> Reveal(index) { AgentPanel(text) } }
            }
        }
        ResumeThreadButton(
            modifier = Modifier
                .align(Alignment.BottomCenter)
                .padding(bottom = bottomInset + MeeshySpacing.lg),
            onClick = {
                haptic.performHapticFeedback(HapticFeedbackType.LongPress)
                showScript()
                state.firstUnreadMessageId?.let(actions.scrollToMessage)
            },
        )
    }
}

/** Le menu d'appui long d'une entrée : ce qui s'offre pour un message, et l'exécution. */
internal class SummaryEntryMenu(
    val offered: (String) -> List<SummaryEntryAction>,
    val run: (SummaryEntryAction, String) -> Unit,
)

/**
 * Une section qui s'installe d'un fondu et d'une montée de 16 dp, décalée de 60 ms par rang — lue
 * au dessin (`graphicsLayer`), sans recomposer. Mouvement réduit : posée d'emblée.
 */
@Composable
private fun Reveal(index: Int, content: @Composable () -> Unit) {
    val reduceMotion = LocalReduceMotion.current
    val progress = remember { Animatable(if (reduceMotion) 1f else 0f) }
    LaunchedEffect(reduceMotion) {
        if (reduceMotion) {
            progress.snapTo(1f)
            return@LaunchedEffect
        }
        delay(index * 60L)
        progress.animateTo(1f, tween(durationMillis = 320, easing = FastOutSlowInEasing))
    }
    Box(
        Modifier.graphicsLayer {
            alpha = progress.value
            translationY = (1f - progress.value) * 16.dp.toPx()
        },
    ) { content() }
}

@Composable
private fun ResumeThreadButton(modifier: Modifier, onClick: () -> Unit) {
    val label = stringResource(R.string.summary_resume_thread)
    val a11y = stringResource(R.string.summary_resume_thread_a11y_label)
    Box(
        modifier = modifier
            .padding(horizontal = MeeshySpacing.lg)
            .fillMaxWidth()
            .heightIn(min = 48.dp)
            .clip(RoundedCornerShape(percent = 50))
            .background(MeeshyPalette.Indigo500)
            .clickable(onClick = onClick)
            .semantics {
                contentDescription = a11y
                role = Role.Button
            }
            .padding(vertical = MeeshySpacing.md),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            text = label,
            color = MeeshyPalette.White,
            fontSize = MeeshyFontSize.body,
            fontWeight = FontWeight.Bold,
        )
    }
}
