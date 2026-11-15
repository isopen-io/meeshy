package me.meeshy.ui.component.chrome

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import me.meeshy.ui.R
import me.meeshy.ui.theme.MeeshyFontSize
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.meeshyText

/** Les cotes de [MeeshySheetHeader]. */
public object SheetHeaderLayout {
    /** La cible tactile d'une capsule d'action : le plancher d'accessibilité d'Android. */
    public val actionMinHeight: Dp = 48.dp
}

/**
 * L'en-tête d'une feuille qui se REFUSE ou se VALIDE : « Annuler » à gauche, « Terminé » à droite,
 * en capsules de verre, et le titre CENTRÉ SUR LA FEUILLE — il ne bouge pas quand un libellé
 * traduit s'allonge.
 *
 * « Annuler » est un CONTRAT : l'hôte restitue dans [onCancel] l'état d'avant l'ouverture, il ne
 * se contente pas de fermer. Un hôte qui ne PEUT pas restituer ne monte pas cet en-tête.
 */
@Composable
public fun MeeshySheetHeader(
    title: String,
    onCancel: () -> Unit,
    onDone: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Box(
        modifier
            .fillMaxWidth()
            .padding(start = MeeshySpacing.lg, end = MeeshySpacing.lg, top = MeeshySpacing.lg, bottom = MeeshySpacing.sm),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            text = title,
            style = meeshyText(MeeshyFontSize.callout, FontWeight.SemiBold),
            color = glassControlForeground(),
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
            textAlign = TextAlign.Center,
            modifier = Modifier.semantics { heading() },
        )
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
            SheetHeaderAction(stringResource(R.string.common_cancel), onCancel)
            SheetHeaderAction(stringResource(R.string.common_done), onDone)
        }
    }
}

@Composable
private fun SheetHeaderAction(label: String, onClick: () -> Unit) {
    MeeshyGlassSurface(shape = CircleShape) {
        Box(
            Modifier
                .clip(CircleShape)
                .heightIn(min = SheetHeaderLayout.actionMinHeight)
                .clickable(role = Role.Button, onClick = onClick)
                .padding(horizontal = MeeshySpacing.lg),
            contentAlignment = Alignment.Center,
        ) {
            Text(
                text = label,
                style = meeshyText(MeeshyFontSize.body, FontWeight.SemiBold),
                color = glassControlForeground(),
                maxLines = 1,
            )
        }
    }
}
