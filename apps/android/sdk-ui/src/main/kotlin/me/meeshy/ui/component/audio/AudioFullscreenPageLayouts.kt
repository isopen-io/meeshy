package me.meeshy.ui.component.audio

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.widthIn
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.setValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import me.meeshy.sdk.model.fullscreen.AudioFullscreenLayout
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

/** Ce qu'une disposition reçoit de la page : des emplacements, jamais l'état. */
internal typealias LyricsSlot = @Composable (Modifier, LyricsPlacement) -> Unit
internal typealias ModifierSlot = @Composable (Modifier) -> Unit

/**
 * **La disposition empilée** (iOS `stackedContent`, directives porteur du 2026-10-13) : les paroles occupent TOUTE la page et
 * défilent SOUS le reste ; l'en-tête (barre, cadran, identité, transport) est posé par-dessus en haut, les langues en bas, chacun
 * sur un voile qui se fond dans le texte. Le texte COMMENCE sous l'en-tête (marge = sa hauteur mesurée), puis remonte derrière lui ;
 * le mot dit se pose au premier tiers de la bande libre ([AudioFullscreenLayout.lyricAnchor]). Le rail d'actions reste au-dessus
 * des langues, et les paroles s'arrêtent à son bord : aucun mot ne passe dessous.
 */
@Composable
internal fun AudioFullscreenStacked(
    layout: AudioFullscreenLayout,
    pageHeight: Float,
    railReserve: Dp,
    showsLanguages: Boolean,
    topBar: @Composable () -> Unit,
    hero: @Composable () -> Unit,
    identity: @Composable () -> Unit,
    transport: @Composable () -> Unit,
    lyrics: LyricsSlot,
    languages: ModifierSlot,
    rail: (@Composable () -> Unit)?,
) {
    val density = LocalDensity.current
    var headerPx by remember { mutableIntStateOf(0) }
    var footerPx by remember { mutableIntStateOf(0) }
    val header = with(density) { headerPx.toDp() }
    val footer = with(density) { footerPx.toDp() }
    val veil = MeeshyTheme.tokens.backgroundPrimary.copy(alpha = VEIL_ALPHA)
    Box(Modifier.fillMaxSize()) {
        lyrics(
            Modifier.fillMaxSize(),
            LyricsPlacement(
                mode = LyricsMode.LYRICS,
                fontSize = layout.lyricSize.sp,
                contentPadding = PaddingValues(start = MeeshySpacing.lg, end = MeeshySpacing.lg + railReserve, top = header, bottom = footer),
                anchor = AudioFullscreenLayout.lyricAnchor(header.value, footer.value, pageHeight),
            ),
        )
        Column(Modifier.fillMaxSize()) {
            Column(
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.spacedBy(AudioFullscreenLayout.STACK_SPACING.dp),
                modifier = Modifier
                    .fillMaxWidth()
                    .onSizeChanged { headerPx = it.height }
                    .veil(veil, towardsBottom = true)
                    .padding(bottom = MeeshySpacing.xl),
            ) {
                topBar()
                Column(
                    horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.spacedBy(AudioFullscreenLayout.STACK_SPACING.dp),
                    modifier = Modifier
                        .widthIn(max = layout.contentMaxWidth.dp)
                        .padding(start = MeeshySpacing.lg, end = MeeshySpacing.lg + railReserve),
                ) {
                    hero()
                    identity()
                    transport()
                }
            }
            Spacer(Modifier.weight(1f))
            if (showsLanguages) {
                languages(
                    Modifier
                        .onSizeChanged { footerPx = it.height }
                        .veil(veil, towardsBottom = false)
                        .padding(start = MeeshySpacing.lg, end = MeeshySpacing.lg, top = MeeshySpacing.xl, bottom = MeeshySpacing.lg),
                )
            }
        }
        if (rail != null) {
            Box(Modifier.align(Alignment.BottomEnd).padding(end = MeeshySpacing.lg, bottom = footer)) { rail() }
        }
    }
}

/**
 * **La disposition côte à côte** (tablette, pliable ouvert, paysage court ; iOS `sideBySideContent`) : le cadran, l'identité et
 * le transport à gauche ; à droite la transcription en MODE LECTURE — une carte de hauteur bornée, sans voile — puis les langues.
 */
@Composable
internal fun AudioFullscreenSideBySide(
    layout: AudioFullscreenLayout,
    railReserve: Dp,
    topBar: @Composable () -> Unit,
    hero: @Composable () -> Unit,
    identity: @Composable () -> Unit,
    transport: @Composable () -> Unit,
    lyrics: LyricsSlot,
    languages: ModifierSlot,
    rail: (@Composable () -> Unit)?,
) {
    Box(Modifier.fillMaxSize()) {
        Column(Modifier.fillMaxSize(), horizontalAlignment = Alignment.CenterHorizontally) {
            topBar()
            Spacer(Modifier.weight(1f))
            Row(
                horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.xxl),
                verticalAlignment = Alignment.CenterVertically,
                modifier = Modifier.padding(start = MeeshySpacing.lg, end = MeeshySpacing.lg + railReserve),
            ) {
                Column(
                    horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.spacedBy(MeeshySpacing.md),
                    modifier = Modifier.weight(1f),
                ) {
                    hero()
                    identity()
                    transport()
                }
                Column(
                    verticalArrangement = Arrangement.spacedBy(MeeshySpacing.md),
                    modifier = Modifier.weight(1f).widthIn(max = layout.contentMaxWidth.dp),
                ) {
                    lyrics(
                        Modifier,
                        LyricsPlacement(mode = LyricsMode.READING, fontSize = layout.lyricSize.sp, maxHeight = layout.transcriptMaxHeight),
                    )
                    languages(Modifier)
                }
            }
            Spacer(Modifier.weight(1f))
        }
        if (rail != null) {
            Box(Modifier.align(Alignment.BottomEnd).padding(end = MeeshySpacing.lg, bottom = MeeshySpacing.lg)) { rail() }
        }
    }
}

/** Le voile (iOS `frost`) : la couleur du sol, opaque presque jusqu'au bord puis fondue vers les paroles qui passent dessous. */
private fun Modifier.veil(color: Color, towardsBottom: Boolean): Modifier = drawBehind {
    val stops = if (towardsBottom) {
        arrayOf(0f to color, VEIL_SOLID_UNTIL to color, 1f to Color.Transparent)
    } else {
        arrayOf(0f to Color.Transparent, 1f - VEIL_SOLID_UNTIL to color, 1f to color)
    }
    drawRect(Brush.verticalGradient(*stops, startY = 0f, endY = size.height))
}

private const val VEIL_ALPHA = 0.82f
private const val VEIL_SOLID_UNTIL = 0.9f
