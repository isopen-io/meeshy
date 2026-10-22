package me.meeshy.ui.component

import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshyRadius
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

/**
 * Etat vide commun (iOS `EmptyStateView`) : vide a froid, filtre sans resultat, erreur serveur,
 * hors ligne. Titre + sous-titre sont regroupes en UN noeud TalkBack ; le glyphe heros est
 * decoratif (masque). [accent] est passe en parametre (jamais un hexadecimal local) ;
 * [compact] ramene l'action au-dessus du titre, comme sur iOS.
 */
@Composable
public fun MeeshyEmptyState(
    icon: ImageVector,
    title: String,
    subtitle: String,
    modifier: Modifier = Modifier,
    actionLabel: String? = null,
    onAction: (() -> Unit)? = null,
    accent: Color = MeeshyPalette.Indigo500,
    compact: Boolean = false,
    secondaryLabel: String? = null,
    onSecondary: (() -> Unit)? = null,
) {
    val hasAction = actionLabel != null && onAction != null
    Column(
        modifier = modifier
            .fillMaxSize()
            .padding(horizontal = MeeshySpacing.xxxl),
        verticalArrangement = Arrangement.spacedBy(
            if (compact) MeeshySpacing.sm else MeeshySpacing.lg,
            Alignment.CenterVertically,
        ),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Icon(
            imageVector = icon,
            contentDescription = null,
            tint = accent.copy(alpha = 0.4f),
            modifier = Modifier.size(if (compact) 36.dp else 52.dp).clearAndSetSemantics { },
        )
        if (hasAction && compact) EmptyStateAction(actionLabel!!, onAction!!, accent, compact)
        Column(
            modifier = Modifier.semantics(mergeDescendants = true) { },
            verticalArrangement = Arrangement.spacedBy(MeeshySpacing.xs),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Text(
                text = title,
                color = MeeshyTheme.tokens.textPrimary,
                fontSize = if (compact) 15.sp else 18.sp,
                fontWeight = FontWeight.Bold,
                textAlign = TextAlign.Center,
            )
            if (subtitle.isNotEmpty()) {
                Text(
                    text = subtitle,
                    color = MeeshyTheme.tokens.textMuted,
                    fontSize = if (compact) 12.sp else 14.sp,
                    textAlign = TextAlign.Center,
                )
            }
        }
        if (hasAction && !compact) EmptyStateAction(actionLabel!!, onAction!!, accent, compact)
        if (secondaryLabel != null && onSecondary != null) {
            TextButton(onClick = onSecondary, modifier = Modifier.heightIn(min = 48.dp)) {
                Text(text = secondaryLabel, color = MeeshyTheme.tokens.textSecondary, fontSize = 14.sp)
            }
        }
    }
}

@Composable
private fun EmptyStateAction(label: String, onClick: () -> Unit, accent: Color, compact: Boolean) {
    TextButton(
        onClick = onClick,
        modifier = Modifier
            .heightIn(min = 48.dp)
            .clip(RoundedCornerShape(MeeshyRadius.pill))
            .background(accent),
    ) {
        Text(
            text = label,
            color = MeeshyPalette.White,
            fontSize = if (compact) 13.sp else 14.sp,
            fontWeight = FontWeight.SemiBold,
            modifier = Modifier.padding(horizontal = if (compact) MeeshySpacing.sm else MeeshySpacing.lg),
        )
    }
}

/**
 * Placeholder plein cadre a froid : un aplat qui respire (shimmer) a la place d'un spinner nu.
 * N'est montre que sur cache VIDE ; masque a TalkBack.
 */
@Composable
public fun MeeshyShimmerPlaceholder(
    modifier: Modifier = Modifier,
    base: Color = MeeshyTheme.tokens.backgroundTertiary,
) {
    val transition = rememberInfiniteTransition(label = "meeshy-shimmer")
    val alpha by transition.animateFloat(
        initialValue = 0.35f,
        targetValue = 0.8f,
        animationSpec = infiniteRepeatable(tween(durationMillis = 900, easing = LinearEasing), RepeatMode.Reverse),
        label = "meeshy-shimmer-alpha",
    )
    Box(modifier.fillMaxSize().background(base.copy(alpha = alpha)).clearAndSetSemantics { })
}
