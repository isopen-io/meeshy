package me.meeshy.ui.component.talkie

import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.ui.platform.LocalContext
import me.meeshy.sdk.model.relation.TalkieHoldDelivery
import me.meeshy.sdk.model.relation.TalkieSendOutcome

/** Met en mots, dans la langue de l'app, l'issue d'une prise de parole qui n'a pas abouti, puis la remet à l'écran. */
@Composable
public fun TalkieNoticeEffect(
    notice: TalkieSendOutcome?,
    onPresent: (TalkieSendOutcome, String) -> Unit,
    delivery: TalkieHoldDelivery = TalkieHoldDelivery.LIVE,
) {
    val context = LocalContext.current
    val present by rememberUpdatedState(onPresent)
    val mode by rememberUpdatedState(delivery)
    LaunchedEffect(notice) {
        val outcome = notice ?: return@LaunchedEffect
        present(outcome, context.getString(TalkieWording.notice(outcome, mode)))
    }
}
