package me.meeshy.ui.component.viewer

import androidx.compose.animation.animateContentSize
import androidx.compose.animation.core.FiniteAnimationSpec
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.sizeIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Shadow
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.IntSize
import androidx.compose.ui.unit.dp
import me.meeshy.sdk.model.caption.MediaCaptionLaw
import me.meeshy.ui.R
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshySpacing

/** L'ombre qui rend le blanc lisible sur n'importe quelle scène : jamais de boîte (`legibleOverCanvas`). */
private val CaptionShadow = Shadow(color = Color.Black.copy(alpha = 0.65f), offset = Offset(0f, 1f), blurRadius = 6f)

/**
 * La légende d'un reel ou d'une story, posée en bas à gauche (iOS `MediaCaptionOverlay`) : texte
 * à l'ombre, jamais dans une boîte. Au-delà de 30 mots ([MediaCaptionLaw]) elle montre les 15
 * premiers et une invite « voir plus » (cible >= 48 dp). Dépliée, elle monte dans une fenêtre
 * défilante bornée à [maxExpandedHeight] sur un voile dégradé, l'invite « voir moins » hors du
 * défilement ; un tap hors du texte la referme SANS naviguer. Repliée, elle ne prend le doigt
 * que sur son invite et sur ses liens : la navigation du canevas reste dessous.
 *
 * @param endInset espace laissé à droite (le rail d'actions).
 * @param bottomInset espace laissé sous la légende (un compositeur épinglé).
 * @param scrollToTopToken chaque incrément ramène le texte déplié à son premier mot (iOS `scrollToTopToken`).
 * @param expandSpec ressort qui anime la croissance du bloc au dépliage ; `null` = saut net.
 * @param anchoredToParent `true` : la couche occupe son parent (ancrée bas-gauche, voile et tap hors
 *   texte qui referme) ; `false` : bloc en ligne dans une colonne de l'hôte, sans voile, que le toucher
 *   du texte replie.
 */
@Composable
public fun MediaCaptionOverlay(
    caption: String,
    expanded: Boolean,
    onToggle: () -> Unit,
    modifier: Modifier = Modifier,
    trackedLinks: Map<String, String>? = null,
    validUsernames: Set<String>? = null,
    onHashtagClick: ((String) -> Unit)? = null,
    onMentionClick: ((String) -> Unit)? = null,
    startInset: Dp = MeeshySpacing.lg,
    endInset: Dp = MeeshySpacing.lg,
    maxExpandedHeight: Dp = 420.dp,
    dimsBackgroundWhenExpanded: Boolean = true,
    bottomInset: Dp = 0.dp,
    anchoredToParent: Boolean = true,
    scrollToTopToken: Int = 0,
    expandSpec: FiniteAnimationSpec<IntSize>? = null,
) {
    val folded = remember(caption) { MediaCaptionLaw.collapse(caption) }
    val open = expanded && folded.isTruncated
    val scrollState = rememberScrollState()
    LaunchedEffect(scrollToTopToken) { if (scrollToTopToken > 0) scrollState.animateScrollTo(0) }
    Box(modifier = if (anchoredToParent) modifier.fillMaxSize() else modifier) {
        if (open && anchoredToParent) {
            Box(
                Modifier
                    .fillMaxSize()
                    .then(
                        if (dimsBackgroundWhenExpanded) {
                            Modifier.background(Brush.verticalGradient(listOf(Color.Transparent, Color.Black.copy(alpha = 0.78f))))
                        } else {
                            Modifier
                        },
                    )
                    .clickable(interactionSource = remember { MutableInteractionSource() }, indication = null, onClick = onToggle),
            )
        }
        Column(
            Modifier
                .then(if (anchoredToParent) Modifier.align(Alignment.BottomStart).navigationBarsPadding() else Modifier)
                .fillMaxWidth()
                .then(if (expandSpec != null) Modifier.animateContentSize(expandSpec) else Modifier)
                .padding(
                    start = startInset,
                    end = endInset,
                    bottom = if (anchoredToParent) bottomInset + MeeshySpacing.xl else 0.dp,
                ),
        ) {
            val body = if (expanded && folded.isTruncated) caption else MediaCaptionLaw.shown(caption, expanded = false)
            val scrolling = if (expanded && folded.isTruncated) {
                Modifier.heightIn(max = maxExpandedHeight).verticalScroll(scrollState)
            } else {
                Modifier
            }
            val textModifier = if (!anchoredToParent && folded.isTruncated) {
                scrolling.clickable(role = Role.Button, onClick = onToggle)
            } else {
                scrolling
            }
            MediaCaptionRichText(
                text = body,
                style = MaterialTheme.typography.bodyLarge.copy(shadow = CaptionShadow),
                modifier = textModifier,
                trackedLinks = trackedLinks,
                validUsernames = validUsernames,
                onHashtagClick = onHashtagClick,
                onMentionClick = onMentionClick,
            )
            if (folded.isTruncated) {
                CaptionAffordance(
                    label = stringResource(if (open) R.string.media_caption_see_less else R.string.media_caption_see_more),
                    hint = stringResource(if (open) R.string.media_caption_see_less_hint else R.string.media_caption_see_more_hint),
                    onClick = onToggle,
                )
            }
        }
    }
}

@Composable
private fun CaptionAffordance(label: String, hint: String, onClick: () -> Unit) {
    Text(
        text = label,
        color = MeeshyPalette.Indigo300,
        fontWeight = FontWeight.Bold,
        style = MaterialTheme.typography.bodyMedium.copy(shadow = CaptionShadow),
        modifier = Modifier
            .sizeIn(minWidth = 48.dp, minHeight = 48.dp)
            .clickable(onClick = onClick)
            .semantics {
                role = Role.Button
                contentDescription = "$label. $hint"
            }
            .padding(vertical = MeeshySpacing.sm),
    )
}
