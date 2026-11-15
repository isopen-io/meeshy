package me.meeshy.app.chat.river

import androidx.compose.foundation.ScrollState
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.requiredWidth
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.derivedStateOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.key
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.RectangleShape
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import me.meeshy.feature.chat.R
import me.meeshy.sdk.model.reading.river.RiverColumnLayout
import me.meeshy.sdk.model.reading.river.RiverLaneHeader
import me.meeshy.sdk.model.reading.river.RiverMetrics
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.theme.MeeshyFontSize
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

/**
 * L'en-tête de couloirs : « les noms en tête reflètent les auteurs de la ligne, fading et apparition
 * pendant le scroll vertical ». Cette vue ne RECALCULE RIEN : elle reçoit les en-têtes déjà rendus par
 * la loi (couloir, graine de couleur, opacité) et pose un nom par entrée. Elle suit le défilement
 * horizontal du volet par un décalage lu à la phase de LAYOUT — jamais une recomposition par image.
 *
 * Les voix hors du champ sont signalées aux deux bords (une pastille par voix, jusqu'à trois, puis le
 * compte) : sans ce signal, un plan de sept couloirs sur un écran qui en montre un et demi laisse
 * croire que la conversation tient tout entière sous les yeux.
 */
@Composable
internal fun RiverLaneHeaderStrip(
    headers: List<RiverLaneHeader>,
    laneWidthDp: Float,
    laneCount: Int,
    horizontal: ScrollState,
    modifier: Modifier = Modifier,
) {
    val density = LocalDensity.current
    val columns = remember(laneWidthDp, laneCount) {
        RiverColumnLayout(laneWidthDp.toDouble(), RiverMetrics.Lane.GUTTER, laneCount.coerceAtLeast(1))
    }
    BoxWithConstraints(
        modifier
            .fillMaxWidth()
            .height(RiverMetrics.LaneHeader.HEIGHT.dp)
            .clip(RectangleShape),
    ) {
        val visibleWidth = maxWidth.value
        val hiddenLeft by remember(headers, columns) {
            derivedStateOf { headers.filter { columns.railX(it.laneIndex) < horizontal.value / density.density } }
        }
        val hiddenRight by remember(headers, columns, visibleWidth) {
            derivedStateOf {
                headers.filter { columns.railX(it.laneIndex) > horizontal.value / density.density + visibleWidth }
            }
        }
        Box(
            Modifier
                .requiredWidth(columns.totalWidth.dp)
                .height(RiverMetrics.LaneHeader.HEIGHT.dp)
                .offset { IntOffset(-horizontal.value, 0) },
        ) {
            headers.forEachIndexed { index, header ->
                key(index) {
                    Box(
                        Modifier
                            .offset((columns.laneLeadingX(header.laneIndex) + RiverMetrics.Lane.GUTTER).dp, 0.dp)
                            .width(columns.bubbleContentWidth.dp)
                            .height(RiverMetrics.LaneHeader.HEIGHT.dp)
                            .graphicsLayer { alpha = header.alpha.toFloat() }
                            .clearAndSetSemantics {},
                        contentAlignment = Alignment.CenterStart,
                    ) { LaneName(header) }
                }
            }
        }
        OffscreenBadge(hiddenLeft, leading = true, Modifier.align(Alignment.CenterStart))
        OffscreenBadge(hiddenRight, leading = false, Modifier.align(Alignment.CenterEnd))
    }
}

@Composable
private fun LaneName(header: RiverLaneHeader) {
    val color = remember(header.colorSeed) { riverLaneColor(header.colorSeed) }
    val name = if (header.isViewer) stringResource(R.string.riviere_header_you) else header.colorSeed
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.xsPlus)) {
        // La pastille ne se comprime jamais : c'est elle qui porte la couleur, donc l'appartenance à la colonne.
        Box(Modifier.size(7.dp).clip(CircleShape).background(color))
        Text(
            text = name.uppercase(),
            color = color,
            fontSize = 11.5.sp,
            fontWeight = FontWeight.SemiBold,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
        )
    }
}

@Composable
private fun OffscreenBadge(hidden: List<RiverLaneHeader>, leading: Boolean, modifier: Modifier) {
    if (hidden.isEmpty()) return
    val label = stringResource(
        if (leading) R.string.riviere_header_offscreen_left else R.string.riviere_header_offscreen_right,
        hidden.size,
    )
    val muted = MeeshyTheme.tokens.textMuted
    Row(
        modifier
            .padding(horizontal = MeeshySpacing.xs)
            .clip(CircleShape)
            .background(MeeshyTheme.tokens.backgroundSecondary.copy(alpha = 0.92f))
            .padding(horizontal = MeeshySpacing.xsPlus, vertical = MeeshySpacing.xxs)
            .semantics { contentDescription = label },
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.xxs),
    ) {
        // « en amont » / « en aval » du plan, jamais « gauche » / « droite » : le plan se retourne en arabe.
        if (!leading) Dots(hidden, muted)
        Icon(
            imageVector = if (leading) MeeshyIcons.ChevronBackward else MeeshyIcons.ChevronForward,
            contentDescription = null,
            tint = muted,
            modifier = Modifier.size(12.dp),
        )
        if (leading) Dots(hidden, muted)
    }
}

@Composable
private fun Dots(hidden: List<RiverLaneHeader>, muted: Color) {
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.xxs)) {
        hidden.take(MAX_DOTS).forEach { header ->
            Box(Modifier.size(5.dp).clip(CircleShape).background(riverLaneColor(header.colorSeed)))
        }
        if (hidden.size > MAX_DOTS) {
            Text(hidden.size.toString(), color = muted, fontSize = MeeshyFontSize.micro, fontWeight = FontWeight.Bold)
        }
    }
}

private const val MAX_DOTS = 3
