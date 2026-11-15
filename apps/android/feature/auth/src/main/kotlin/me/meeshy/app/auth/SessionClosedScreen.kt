package me.meeshy.app.auth

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.foundation.layout.size
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawWithContent
import androidx.compose.ui.graphics.BlendMode
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.CompositingStrategy
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.semantics.isTraversalGroup
import androidx.compose.ui.semantics.paneTitle
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import me.meeshy.feature.auth.R
import me.meeshy.ui.component.MeeshyPrimaryButton
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

/**
 * **Session fermée** : le compte de cette session a été supprimé ailleurs, l'appareil est déjà purgé. Un seul bouton de sortie
 * (« Se reconnecter ») et aucun retour vers l'écran refusé : le geste Retour est absorbé, rien dessous n'existe plus.
 */
@Composable
fun SessionClosedScreen(onContinue: () -> Unit, modifier: Modifier = Modifier) {
    BackHandler {}
    RefusalPage(
        icon = MeeshyIcons.PersonOff,
        title = stringResource(R.string.session_closed_signed_out_title),
        message = stringResource(R.string.session_closed_signed_out_message),
        action = stringResource(R.string.session_closed_continue),
        onAction = onContinue,
        modifier = modifier,
    )
}

/** 72 dp qui suit la taille de police, plafonnée à 110 dp (iOS `@ScaledMetric`, `min(symbolSize, 110)`). */
internal fun refusalIconSize(fontScale: Float): Dp = minOf((72f * fontScale).dp, 110.dp)

/** La page de refus plein écran partagée : une icône, un titre, un message, UN bouton. */
@Composable
internal fun RefusalPage(
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    title: String,
    message: String,
    action: String,
    onAction: () -> Unit,
    modifier: Modifier = Modifier,
    iconBrush: Brush? = null,
) {
    val tokens = MeeshyTheme.tokens
    val iconSize = refusalIconSize(LocalDensity.current.fontScale)
    Column(
        modifier = modifier
            .fillMaxSize()
            .background(tokens.backgroundPrimary)
            // Le calque couvre l'app : aucun toucher n'atteint ce qui est dessous.
            .pointerInput(Unit) {}
            .semantics { paneTitle = title; isTraversalGroup = true }
            .safeDrawingPadding()
            .padding(horizontal = MeeshySpacing.xxl)
            .padding(bottom = MeeshySpacing.xxl),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(MeeshySpacing.xl, Alignment.CenterVertically),
    ) {
        if (iconBrush == null) {
            Icon(imageVector = icon, contentDescription = null, tint = MeeshyPalette.Indigo500, modifier = Modifier.size(iconSize))
        } else {
            Icon(
                imageVector = icon,
                contentDescription = null,
                tint = Color.Black,
                modifier = Modifier
                    .size(iconSize)
                    .graphicsLayer(compositingStrategy = CompositingStrategy.Offscreen)
                    .drawWithContent {
                        drawContent()
                        drawRect(brush = iconBrush, blendMode = BlendMode.SrcIn)
                    },
            )
        }
        Text(
            text = title,
            style = MaterialTheme.typography.headlineSmall,
            fontWeight = FontWeight.Bold,
            color = tokens.textPrimary,
            textAlign = TextAlign.Center,
            modifier = Modifier.semantics { heading() },
        )
        Text(text = message, style = MaterialTheme.typography.bodyLarge, color = tokens.textSecondary, textAlign = TextAlign.Center)
        MeeshyPrimaryButton(text = action, onClick = onAction, modifier = Modifier.fillMaxWidth())
    }
}
