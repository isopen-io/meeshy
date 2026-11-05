package me.meeshy.ui.component.focal

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import me.meeshy.sdk.model.avatar.AvatarContext
import me.meeshy.sdk.model.reading.focal.AgentAuthoredStyle
import me.meeshy.sdk.model.reading.focal.FocalMetrics
import me.meeshy.sdk.theme.DynamicColorGenerator
import me.meeshy.ui.R
import me.meeshy.ui.component.MeeshyAvatar
import me.meeshy.ui.component.bubble.BubbleSenderGhost
import me.meeshy.ui.component.rememberConversationHere
import me.meeshy.ui.component.rememberPresence
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshyRadius
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme
import me.meeshy.ui.theme.hexColor

/**
 * L'en-tête d'identité de la tête de groupe (iOS `FocalIdentityHeader`) : pastille 22 (anneau de
 * story et humeur servis par l'environnement social, présence des amis seulement — hors ligne =
 * aucun point), anneau POINTILLÉ d'un message d'agent quand le drapeau de grammaire est allumé,
 * nom en sous-titre très gras, « Toi » en indigo 500 pour soi. Hauteur minimale 34, celle de la
 * pastille du focus : la rangée ne change jamais de hauteur. Un toucher ouvre la fiche de l'auteur.
 */
@Composable
public fun FocalIdentityHeader(
    input: FocalRowInput,
    modifier: Modifier = Modifier,
    agentGrammarEnabled: Boolean = false,
    onSenderTap: (() -> Unit)? = null,
) {
    val you = stringResource(R.string.focal_row_you)
    val displayName = if (input.isMe) you else input.senderName ?: ""
    val senderColor = remember(input.senderColorHex, input.senderName) {
        val hex = input.senderColorHex ?: input.senderName?.let(DynamicColorGenerator::colorForName)
        hex?.let { hexColor(it, MeeshyPalette.Indigo500) } ?: MeeshyPalette.Indigo500
    }
    val nameColor = when {
        input.isMe -> MeeshyPalette.Indigo500
        MeeshyTheme.isDark -> Color.White.copy(alpha = 0.92f)
        else -> Color.Black.copy(alpha = 0.88f)
    }
    val agent = AgentAuthoredStyle.resolve(input.isAgentAuthored, agentGrammarEnabled)
    val profileLabel = stringResource(R.string.bubble_view_profile)
    val diameter = FlatRowDiameter
    Row(
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.xsPlus),
        modifier = modifier
            .heightIn(min = FocalMetrics.Focus.AVATAR_SIZE.toFloat().dp)
            .let { base ->
                if (onSenderTap == null) base
                else base.clip(RoundedCornerShape(MeeshyRadius.sm)).clickable(onClickLabel = profileLabel, onClick = onSenderTap)
            },
    ) {
        if (input.senderIsAnonymous) {
            BubbleSenderGhost(size = diameter, color = senderColor)
        } else {
            Box(contentAlignment = Alignment.Center) {
                MeeshyAvatar(
                    name = input.senderName ?: you,
                    context = AvatarContext.Custom(diameter.value),
                    containerColor = senderColor,
                    imageUrl = input.senderAvatarUrl,
                    userId = input.senderUserId,
                    presence = rememberPresence(input.senderUserId),
                    here = rememberConversationHere(input.senderUserId, input.viewingConversationId),
                    decorRing = input.senderRing,
                )
                if (agent.showsDashedRing) AgentDashedRing(diameter = diameter, color = MeeshyPalette.Indigo500)
            }
        }
        Text(
            text = displayName,
            fontSize = NAME_SIZE_SP.sp,
            fontWeight = FontWeight.ExtraBold,
            color = nameColor,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
        )
        if (agent.showsSpark) {
            Text(text = "✦", fontSize = 11.sp, fontWeight = FontWeight.ExtraBold, color = MeeshyPalette.Indigo500)
        }
    }
}

private const val NAME_SIZE_SP = 13f

private val FlatRowDiameter: Dp = FocalMetrics.Avatar.SIZE.toFloat().dp

/** L'anneau pointillé d'un auteur-agent (iOS `agentAuthoredAvatarRing`) : trait de 1,5, tirets 3/3, autour de la pastille. */
@Composable
internal fun AgentDashedRing(diameter: Dp, color: Color, modifier: Modifier = Modifier) {
    val outer = diameter + 6.dp
    Canvas(modifier.size(outer)) {
        val stroke = 1.5.dp.toPx()
        drawCircle(
            color = color,
            radius = (size.minDimension - stroke) / 2f,
            center = Offset(size.width / 2f, size.height / 2f),
            style = Stroke(width = stroke, pathEffect = PathEffect.dashPathEffect(floatArrayOf(3.dp.toPx(), 3.dp.toPx()))),
        )
    }
}
