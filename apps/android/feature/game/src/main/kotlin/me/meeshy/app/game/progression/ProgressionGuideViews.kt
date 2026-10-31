package me.meeshy.app.game.progression

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.onClick
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.launch
import me.meeshy.app.game.pages.count
import me.meeshy.feature.game.R
import me.meeshy.sdk.model.game.guide.GuideCard
import me.meeshy.sdk.model.game.guide.GuidePresentation
import me.meeshy.sdk.model.game.rules.GuideFilms
import me.meeshy.sdk.model.game.rules.GuideSpeaker
import me.meeshy.ui.component.game.GameBounceButton
import me.meeshy.ui.component.game.MeeFigure
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshyRadius
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

internal const val GUIDE_LINE_TAG = "game.guide.line"
internal const val GUIDE_CARD_TAG = "game.guide.card"
internal const val GUIDE_ACTION_TAG = "game.guide.action"
internal const val GUIDE_DISMISS_TAG = "game.guide.dismiss"
internal const val GUIDE_SKIP_ALL_TAG = "game.guide.skip_all"
internal const val GUIDE_PHOTO_TAG = "game.guide.photo"
internal const val GUIDE_MORE_TAG = "game.guide.more"

/**
 * LA LIGNE COURTE DE MEE (iOS `ProgressionGuideLine`) — au-dessus des cartes de la première page : Mee en image fixe,
 * la version d'UNE ligne, un chevron. Un toucher ouvre le message entier ; ses boutons vivent dans la feuille.
 */
@Composable
internal fun ProgressionGuideLine(card: GuideCard, onOpen: () -> Unit, modifier: Modifier = Modifier) {
    val short = guideCopy(card).short
    val hint = stringResource(R.string.game_concept_guide_hint)
    val film = GuideFilms.of(card.speaker, card.mood).mee ?: FALLBACK_MEE_FILM
    GameBounceButton(
        onClick = onOpen,
        modifier = modifier
            .fillMaxWidth()
            .testTag(GUIDE_LINE_TAG)
            .clearAndSetSemantics {
                contentDescription = short
                role = Role.Button
                onClick(label = hint) { onOpen(); true }
            },
    ) {
        Row(
            Modifier
                .fillMaxWidth()
                .clip(RoundedCornerShape(MeeshyRadius.md))
                .background(MeeshyPalette.Indigo500.copy(alpha = LINE_TINT))
                .padding(horizontal = MeeshySpacing.lg, vertical = MeeshySpacing.sm)
                .heightIn(min = 44.dp),
            horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.md),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            MeeFigure(filmId = film, side = 40.dp, animates = false)
            Text(
                short,
                Modifier.weight(1f),
                style = MaterialTheme.typography.bodyMedium,
                fontWeight = FontWeight.SemiBold,
                color = MeeshyTheme.tokens.textPrimary,
            )
            Icon(MeeshyIcons.ChevronForward, contentDescription = null, tint = MeeshyPalette.Indigo500, modifier = Modifier.size(18.dp))
        }
    }
}

/** La feuille du message ENTIER de Mee (iOS `ProgressionFrontList.fullGuide`) : la carte, toujours en version complète. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
internal fun ProgressionGuideSheet(
    card: GuideCard,
    onClose: () -> Unit,
    onAction: () -> Unit,
    onDismiss: () -> Unit,
    onSkipAll: () -> Unit,
    onPhoto: (() -> Unit)?,
) {
    val state = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    val scope = rememberCoroutineScope()
    val closeThen: (() -> Unit) -> Unit = { after ->
        scope.launch { state.hide() }.invokeOnCompletion {
            onClose()
            after()
        }
    }
    ModalBottomSheet(onDismissRequest = onClose, sheetState = state, containerColor = MeeshyTheme.tokens.backgroundPrimary) {
        Column(
            Modifier
                .verticalScroll(rememberScrollState())
                .padding(MeeshySpacing.lg)
                .navigationBarsPadding(),
        ) {
            GameGuideCardView(
                card = card.copy(presentation = GuidePresentation.Full),
                onAction = { closeThen(onAction) },
                onDismiss = { closeThen(onDismiss) },
                onSkipAll = if (card.step == null) null else ({ closeThen(onSkipAll) }),
                onPhoto = onPhoto?.let { photo -> { closeThen(photo) } },
            )
        }
    }
}

/**
 * LA CARTE DE MEE ET MEO (iOS `GameGuideCardView`) — un guide à côté d'un texte à quatre temps : ce qui vient
 * d'arriver, ce que ça veut dire, l'étape d'après, un bouton qui y mène. Complète la première fois, UNE ligne ensuite,
 * « ? » rouvrant l'entier ; pendant l'intégration « Étape 3 sur 7 », « Passer » et « Passer l'intégration ». Le dessin
 * est décoratif, la carte se lit en entier.
 */
@Composable
internal fun GameGuideCardView(
    card: GuideCard,
    onAction: () -> Unit,
    onDismiss: () -> Unit,
    onSkipAll: (() -> Unit)? = null,
    onPhoto: (() -> Unit)? = null,
) {
    var expanded by rememberSaveable(card.key) { mutableStateOf(false) }
    val copy = guideCopy(card)
    val short = card.presentation == GuidePresentation.Short && !expanded
    val tokens = MeeshyTheme.tokens
    Row(
        Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(MeeshyRadius.lg))
            .background(MeeshyPalette.Indigo500.copy(alpha = CARD_TINT))
            .padding(MeeshySpacing.lg)
            .testTag(GUIDE_CARD_TAG),
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.md),
        verticalAlignment = Alignment.Top,
    ) {
        GuideFigures(card)
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(MeeshySpacing.xs)) {
            GuideHeader(card, expanded, onToggle = { expanded = !expanded })
            if (short) {
                Text(copy.short, style = MaterialTheme.typography.bodyLarge, fontWeight = FontWeight.SemiBold, color = tokens.textPrimary)
            } else {
                Text(copy.what, style = MaterialTheme.typography.bodyLarge, fontWeight = FontWeight.Bold, color = tokens.textPrimary)
                GuideLabeled(stringResource(R.string.game_guide_means_label), copy.means)
                GuideLabeled(stringResource(R.string.game_guide_next_label), copy.next)
            }
            GuideActions(card, copy.action, onAction, onDismiss, onSkipAll, onPhoto)
        }
    }
}

@Composable
private fun GuideFigures(card: GuideCard) {
    val films = GuideFilms.of(card.speaker, card.mood)
    val side = if (card.speaker == GuideSpeaker.Duo) 56.dp else 64.dp
    Row(Modifier.widthIn(max = 96.dp).clearAndSetSemantics {}) {
        films.mee?.let { MeeFigure(filmId = it, side = side) }
        films.meo?.let {
            val overlap = if (films.mee != null) Modifier.offset(x = (-10).dp) else Modifier
            MeeFigure(filmId = it, side = side, modifier = overlap, mirrored = true)
        }
    }
}

@Composable
private fun GuideHeader(card: GuideCard, expanded: Boolean, onToggle: () -> Unit) {
    val locale = LocalConfiguration.current.locales[0]
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.xs)) {
        Text(
            speakerName(card.speaker).uppercase(locale),
            style = MaterialTheme.typography.labelMedium,
            fontWeight = FontWeight.Bold,
            color = MeeshyPalette.Indigo500,
        )
        card.step?.let { position ->
            Text(
                stringResource(R.string.game_guide_step_of, count(position.index), count(position.total)),
                style = MaterialTheme.typography.labelMedium,
                color = MeeshyTheme.tokens.textMuted,
            )
        }
        Spacer(Modifier.weight(1f))
        if (card.presentation == GuidePresentation.Short && card.step == null) {
            val more = stringResource(R.string.game_guide_more)
            IconButton(onClick = onToggle, modifier = Modifier.size(44.dp).testTag(GUIDE_MORE_TAG).semantics { contentDescription = more }) {
                Icon(if (expanded) MeeshyIcons.ChevronUp else MeeshyIcons.Info, contentDescription = null, tint = MeeshyTheme.tokens.textMuted)
            }
        }
    }
}

@Composable
private fun GuideLabeled(label: String, text: String) {
    val locale = LocalConfiguration.current.locales[0]
    Column {
        Text(label.uppercase(locale), style = MaterialTheme.typography.labelSmall, fontWeight = FontWeight.SemiBold, color = MeeshyTheme.tokens.textMuted)
        Text(text, style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.Medium, color = MeeshyTheme.tokens.textPrimary)
    }
}

@Composable
private fun GuideActions(
    card: GuideCard,
    action: String,
    onAction: () -> Unit,
    onDismiss: () -> Unit,
    onSkipAll: (() -> Unit)?,
    onPhoto: (() -> Unit)?,
) {
    val muted = MeeshyTheme.tokens.textMuted
    Column(verticalArrangement = Arrangement.spacedBy(MeeshySpacing.xs)) {
        Row(horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.sm), verticalAlignment = Alignment.CenterVertically) {
            GameBounceButton(onClick = onAction, modifier = Modifier.testTag(GUIDE_ACTION_TAG)) {
                Text(
                    action,
                    Modifier
                        .clip(CircleShape)
                        .background(MeeshyPalette.Indigo500)
                        .heightIn(min = 44.dp)
                        .padding(horizontal = MeeshySpacing.lg, vertical = MeeshySpacing.sm),
                    style = MaterialTheme.typography.labelLarge,
                    fontWeight = FontWeight.SemiBold,
                    color = androidx.compose.ui.graphics.Color.White,
                )
            }
            TextButton(onClick = onDismiss, modifier = Modifier.heightIn(min = 44.dp).testTag(GUIDE_DISMISS_TAG)) {
                Text(
                    stringResource(if (card.step == null) R.string.game_guide_dismiss else R.string.game_guide_skip),
                    fontWeight = FontWeight.SemiBold,
                    color = muted,
                )
            }
        }
        if (card.photo && onPhoto != null) {
            TextButton(onClick = onPhoto, modifier = Modifier.heightIn(min = 44.dp).testTag(GUIDE_PHOTO_TAG)) {
                Icon(MeeshyIcons.Camera, contentDescription = null, tint = MeeshyPalette.Indigo500, modifier = Modifier.size(18.dp))
                Spacer(Modifier.size(MeeshySpacing.xs))
                Text(stringResource(R.string.game_guide_photo), fontWeight = FontWeight.SemiBold, color = MeeshyPalette.Indigo500)
            }
        }
        if (card.step != null && onSkipAll != null) {
            TextButton(onClick = onSkipAll, modifier = Modifier.heightIn(min = 44.dp).testTag(GUIDE_SKIP_ALL_TAG)) {
                Text(stringResource(R.string.game_guide_skip_all), style = MaterialTheme.typography.labelMedium, color = muted)
            }
        }
    }
}

private const val FALLBACK_MEE_FILM = "mee-sourire"
private const val LINE_TINT = 0.12f
private const val CARD_TINT = 0.08f
