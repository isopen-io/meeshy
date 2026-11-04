package me.meeshy.app.game

import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.Spring
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.focusable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawWithContent
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.graphics.ColorFilter
import androidx.compose.ui.graphics.ColorMatrix
import androidx.compose.ui.graphics.Paint
import androidx.compose.ui.graphics.drawscope.drawIntoCanvas
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import me.meeshy.app.game.progression.ConceptGauge
import me.meeshy.app.game.progression.ConceptLink
import me.meeshy.app.game.progression.BadgeGuideLink
import me.meeshy.app.game.progression.ProgressionCardFrame
import me.meeshy.app.game.progression.RowDivider
import me.meeshy.app.game.progression.tint
import me.meeshy.feature.game.R
import me.meeshy.sdk.model.game.GameBounceSpec
import me.meeshy.sdk.model.game.element.GameElementDetail
import me.meeshy.sdk.model.game.element.GameElementKind
import me.meeshy.sdk.model.game.element.GameElementStatus
import me.meeshy.sdk.model.game.progression.ProgressionConcept
import me.meeshy.ui.accessibility.LocalReduceMotion
import me.meeshy.ui.component.game.GameBounceButton
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshyRadius
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

/**
 * LA FEUILLE DE PRÉCISIONS d'un élément du jeu (miroir de `GameElementSheet`, iOS) : UN composant pour toutes les
 * familles. Une feuille du bas ajustée à son contenu (grande en le glissant), poignée visible ; l'emblème entre en grand
 * avec le MÊME ressort que le rebond du toucher, puis le nom — sur lequel le lecteur d'écran se pose après 350 ms —,
 * l'état, la jauge, ce que c'est, comment l'obtenir, les données et la rareté quand elle est servie.
 * « Voir la fiche » et « Comprendre les médailles » sont des RAPPELS : la feuille se referme avant de les appeler.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
internal fun GameElementSheet(
    detail: GameElementDetail,
    onDismiss: () -> Unit,
    onOpenConcept: ((ProgressionConcept) -> Unit)? = null,
    onOpenBadgesGuide: (() -> Unit)? = null,
) {
    val state = rememberModalBottomSheetState(skipPartiallyExpanded = false)
    val scope = rememberCoroutineScope()
    val closeThen: (() -> Unit) -> Unit = { after ->
        scope.launch { state.hide() }.invokeOnCompletion {
            onDismiss()
            after()
        }
    }
    ModalBottomSheet(onDismissRequest = onDismiss, sheetState = state, containerColor = MeeshyTheme.tokens.backgroundPrimary) {
        GameElementSheetContent(
            detail = detail,
            onClose = { closeThen {} },
            onOpenConcept = onOpenConcept?.let { open -> { concept: ProgressionConcept -> closeThen { open(concept) } } },
            onOpenBadgesGuide = onOpenBadgesGuide?.takeIf { detail.kind == GameElementKind.Badge }?.let { open -> { closeThen(open) } },
        )
    }
}

@Composable
internal fun GameElementSheetContent(
    detail: GameElementDetail,
    onClose: () -> Unit,
    onOpenConcept: ((ProgressionConcept) -> Unit)?,
    onOpenBadgesGuide: (() -> Unit)?,
) {
    val res = LocalContext.current.resources
    val locale = LocalConfiguration.current.locales[0]
    val tokens = MeeshyTheme.tokens
    val texts = remember(detail, res, locale) { GameElementSheetTexts.of(res, locale, detail) }
    val reduce = LocalReduceMotion.current
    val nameFocus = remember { FocusRequester() }
    LaunchedEffect(detail.id) {
        delay(NAME_FOCUS_DELAY_MILLIS)
        runCatching { nameFocus.requestFocus() }
    }
    Column(
        Modifier
            .testTag(GAME_ELEMENT_SHEET_TAG)
            .fillMaxWidth()
            .widthIn(max = SHEET_MAX_WIDTH)
            .verticalScroll(rememberScrollState())
            .padding(horizontal = MeeshySpacing.lg)
            .navigationBarsPadding()
            .padding(bottom = MeeshySpacing.lg),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(MeeshySpacing.lg),
    ) {
        EnteringEmblem(detail, reduce)
        Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(MeeshySpacing.xs)) {
            Text(
                texts.name,
                Modifier
                    .testTag(GAME_ELEMENT_NAME_TAG)
                    .focusRequester(nameFocus)
                    .focusable()
                    .semantics { heading() },
                style = MaterialTheme.typography.titleLarge,
                fontWeight = FontWeight.Bold,
                color = tokens.textPrimary,
                textAlign = TextAlign.Center,
            )
            StatusLine(detail.status, texts.status)
        }
        detail.progress?.let { ConceptGauge(it.toFloat(), detail.concept.tint()) }
        SheetSection(stringResource(R.string.game_fiche_what), texts.what)
        texts.how?.let { SheetSection(texts.howTitle, it) }
        if (texts.facts.isNotEmpty()) Facts(texts.facts)
        texts.rarity?.let { SheetSection(stringResource(R.string.game_detail_rarity), it) }
        onOpenBadgesGuide?.let { BadgeGuideLink(it) }
        onOpenConcept?.let { open ->
            ConceptLink(
                title = stringResource(R.string.game_detail_see_fiche),
                leading = MeeshyIcons.Forward,
                onClick = { open(detail.concept) },
            )
        }
        CloseButton(onClose)
    }
}

/** L'emblème en grand : échelle 0,6 → 1 au MÊME ressort que le rebond, un fondu simple sous mouvement réduit ; désaturé à 0,2 s'il est verrouillé. */
@Composable
private fun EnteringEmblem(detail: GameElementDetail, reduce: Boolean) {
    val scale = remember { Animatable(if (reduce) 1f else GameBounceSpec.ENTRANCE_SCALE) }
    val alpha = remember { Animatable(ENTRANCE_ALPHA) }
    LaunchedEffect(Unit) {
        launch { alpha.animateTo(1f, tween(ENTRANCE_FADE_MILLIS)) }
        if (!reduce) {
            scale.animateTo(1f, spring(dampingRatio = GameBounceSpec.RELEASE_DAMPING, stiffness = Spring.StiffnessMediumLow))
        }
    }
    GameElementEmblemView(
        detail.emblem,
        Modifier
            .padding(top = MeeshySpacing.xl)
            .graphicsLayer {
                scaleX = scale.value
                scaleY = scale.value
                this.alpha = alpha.value
            }
            .saturation(if (detail.isLockedLook) LOCKED_SATURATION else 1f),
    )
}

@Composable
private fun StatusLine(status: GameElementStatus, line: String) {
    if (status is GameElementStatus.Value) {
        Text(line, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold, color = MeeshyTheme.tokens.textPrimary, textAlign = TextAlign.Center)
        return
    }
    val obtained = status is GameElementStatus.Obtained
    val color = if (obtained) MeeshyPalette.Success else MeeshyTheme.tokens.textMuted
    Row(
        Modifier.clearAndSetSemantics { contentDescription = line },
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.xs),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(if (obtained) MeeshyIcons.VerifiedFilled else MeeshyIcons.LockFilled, contentDescription = null, tint = color, modifier = Modifier.size(16.dp))
        Text(line, style = MaterialTheme.typography.bodySmall, fontWeight = FontWeight.SemiBold, color = color, textAlign = TextAlign.Center)
    }
}

@Composable
private fun SheetSection(title: String, text: String) {
    Column(Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(MeeshySpacing.xs)) {
        Text(
            title.uppercase(LocalConfiguration.current.locales[0]),
            Modifier.fillMaxWidth().semantics { heading() },
            style = MaterialTheme.typography.labelMedium,
            fontWeight = FontWeight.SemiBold,
            color = MeeshyTheme.tokens.textMuted,
        )
        Text(text, style = MaterialTheme.typography.bodyMedium, color = MeeshyTheme.tokens.textPrimary)
    }
}

@Composable
private fun Facts(facts: List<GameSheetFact>) {
    val tokens = MeeshyTheme.tokens
    ProgressionCardFrame {
        facts.forEachIndexed { index, fact ->
            if (index > 0) RowDivider()
            Row(
                Modifier.fillMaxWidth().semantics(mergeDescendants = true) {},
                horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.md),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(fact.label, Modifier.weight(1f), style = MaterialTheme.typography.bodyMedium, color = tokens.textMuted)
                Text(fact.value, style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.SemiBold, color = tokens.textPrimary)
            }
        }
    }
}

@Composable
private fun CloseButton(onClose: () -> Unit) {
    GameBounceButton(onClick = onClose, modifier = Modifier.fillMaxWidth()) {
        Box(
            Modifier
                .fillMaxWidth()
                .heightIn(min = 48.dp)
                .clip(RoundedCornerShape(MeeshyRadius.md))
                .background(MeeshyTheme.tokens.textMuted.copy(alpha = CLOSE_FILL_ALPHA)),
            contentAlignment = Alignment.Center,
        ) {
            Text(stringResource(R.string.game_detail_close), style = MaterialTheme.typography.bodyLarge, fontWeight = FontWeight.SemiBold, color = MeeshyTheme.tokens.textPrimary)
        }
    }
}

/** Désature ce qui est dessiné (iOS `.saturation`) ; à 1, rien ne change et aucun calque n'est posé. */
private fun Modifier.saturation(amount: Float): Modifier = if (amount >= 1f) {
    this
} else {
    drawWithContent {
        val paint = Paint().apply { colorFilter = ColorFilter.colorMatrix(ColorMatrix().apply { setToSaturation(amount) }) }
        drawIntoCanvas { canvas ->
            canvas.saveLayer(Rect(Offset.Zero, size), paint)
            drawContent()
            canvas.restore()
        }
    }
}

/** Les identifiants de la feuille (iOS `game.detail`, `game.detail.name`) : les témoins la distinguent de la page qu'elle recouvre. */
internal const val GAME_ELEMENT_SHEET_TAG = "game.element.sheet"
internal const val GAME_ELEMENT_NAME_TAG = "game.element.name"

/** Le focus d'accessibilité attend que la feuille soit posée : un focus donné pendant sa montée se perd. */
internal const val NAME_FOCUS_DELAY_MILLIS = 350L

private val SHEET_MAX_WIDTH = 560.dp
private const val ENTRANCE_ALPHA = 0.2f
private const val ENTRANCE_FADE_MILLIS = 250
private const val LOCKED_SATURATION = 0.2f
private const val CLOSE_FILL_ALPHA = 0.12f
