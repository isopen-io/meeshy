package me.meeshy.ui.component.phonereachability

import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import kotlinx.coroutines.delay
import me.meeshy.sdk.model.phonereachability.PhoneUnreachableLasting
import me.meeshy.sdk.model.relation.TalkieHoldDelivery

/**
 * Le téléphone de [userId] est-il injoignable depuis assez longtemps (#20241, iso `PhoneUnreachableLastingReader`) ? La
 * valeur du cache tout de suite, chacun de ses changements, et le passage du seuil sans attendre un autre événement. Sans
 * état servi, toujours `false` : rien n'est deviné.
 */
@Composable
fun rememberPhoneUnreachableLasting(userId: String?): Boolean {
    val state = rememberPhoneReachability(userId)
    var now by remember(state) { mutableLongStateOf(System.currentTimeMillis()) }
    LaunchedEffect(state, now) {
        val wait = PhoneUnreachableLasting.remainingMs(state, now) ?: return@LaunchedEffect
        delay(wait + THRESHOLD_MARGIN_MS)
        now = System.currentTimeMillis()
    }
    return PhoneUnreachableLasting.isLasting(state, now)
}

/** Ce que le geste du talkie fait partir vers [userId] : la voix en direct, ou un message vocal quand son téléphone ne répond plus. */
@Composable
fun rememberTalkieHoldDelivery(userId: String?): TalkieHoldDelivery =
    TalkieHoldDelivery.of(lasting = rememberPhoneUnreachableLasting(userId))

private const val THRESHOLD_MARGIN_MS = 1_000L
