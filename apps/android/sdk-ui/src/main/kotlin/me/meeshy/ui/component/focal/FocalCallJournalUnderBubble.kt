package me.meeshy.ui.component.focal

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.expandVertically
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.shrinkVertically
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.widthIn
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import me.meeshy.ui.R
import me.meeshy.ui.accessibility.LocalReduceMotion
import me.meeshy.ui.theme.MeeshySpacing

/**
 * Sous la bulle d'appel : « Afficher la transcription » déplie le journal d'après l'appel et ses lignes de capture, « Masquer »
 * le replie (planche A1 ; web `CallNoticeAction`). L'état survit au défilement de la liste ; le journal lui-même est celui de
 * l'historique, déjà chargé quand il l'est, sans attente affichée. Rien ne s'ajoute sans hôte ([LocalCallJournal] absent).
 * La bascule se range du côté de la carte, comme ce qu'iOS pose sous elle (`BubbleCallNoticeView`) : à droite pour un
 * appel sortant, à gauche pour un entrant (côtés logiques, droite à gauche compris).
 */
@Composable
internal fun FocalCallJournalUnderBubble(
    request: CallJournalRequest,
    slot: CallJournalSlot,
    alignEnd: Boolean,
    modifier: Modifier = Modifier,
) {
    var open by rememberSaveable(request.callId) { mutableStateOf(false) }
    val reduceMotion = LocalReduceMotion.current
    val label = stringResource(if (open) R.string.focal_call_journal_hide else R.string.focal_call_journal_show)
    Column(modifier = modifier.fillMaxWidth(), horizontalAlignment = Alignment.CenterHorizontally) {
        TextButton(
            onClick = { open = !open },
            modifier = Modifier
                .align(if (alignEnd) Alignment.End else Alignment.Start)
                .padding(horizontal = MeeshySpacing.lg)
                .heightIn(min = 48.dp),
        ) {
            Text(text = label, fontSize = 12.5.sp, fontWeight = FontWeight.SemiBold, color = request.accent)
        }
        AnimatedVisibility(
            visible = open,
            enter = if (reduceMotion) fadeIn() else fadeIn() + expandVertically(),
            exit = if (reduceMotion) fadeOut() else fadeOut() + shrinkVertically(),
        ) {
            Column(Modifier.widthIn(max = 560.dp).padding(horizontal = MeeshySpacing.lg, vertical = MeeshySpacing.xs)) {
                slot(request)
            }
        }
    }
}
