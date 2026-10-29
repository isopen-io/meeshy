package me.meeshy.app.stories

import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.test.junit4.ComposeContentTestRule
import androidx.compose.ui.test.onNodeWithTag
import io.mockk.every
import io.mockk.mockk
import kotlinx.coroutines.flow.flowOf
import me.meeshy.sdk.model.PresenceState
import me.meeshy.sdk.model.UserPresence
import me.meeshy.sdk.socket.PresenceStore
import me.meeshy.ui.component.LocalPresenceStore
import me.meeshy.ui.component.presenceDotTag
import me.meeshy.ui.theme.MeeshyTheme

/**
 * Le magasin de présence des témoins de surfaces (#13745) : [live] est la carte vivante (userId -> état),
 * [now] l'horloge ; une présence SERVIE par la ligne sert de repli quand la carte n'a rien pour le compte,
 * comme le vrai [PresenceStore]. Un compte absent des deux n'a aucun point.
 */
internal fun presenceStore(live: Map<String, PresenceState> = emptyMap(), now: Long = PRESENCE_NOW): PresenceStore = mockk {
    every { currentStateOf(any(), any()) } answers { live[firstArg()] ?: secondArg<UserPresence?>()?.state(now) }
    every { presenceOf(any(), any()) } answers { flowOf(live[firstArg()] ?: secondArg<UserPresence?>()?.state(now)) }
    every { presenceOf(any()) } answers { flowOf(live[firstArg()]) }
}

internal const val PRESENCE_NOW: Long = 1_700_000_000_000L

internal fun presenceIso(epochMillis: Long): String = java.time.Instant.ofEpochMilli(epochMillis).toString()

internal fun ComposeContentTestRule.showWithPresence(store: PresenceStore, content: @Composable () -> Unit) {
    setContent { MeeshyTheme { CompositionLocalProvider(LocalPresenceStore provides store) { content() } } }
}

internal fun ComposeContentTestRule.assertDot(state: PresenceState) =
    onNodeWithTag(presenceDotTag(state), useUnmergedTree = true).assertExists()

internal fun ComposeContentTestRule.assertNoDot() {
    PresenceState.values().forEach { onNodeWithTag(presenceDotTag(it), useUnmergedTree = true).assertDoesNotExist() }
}
