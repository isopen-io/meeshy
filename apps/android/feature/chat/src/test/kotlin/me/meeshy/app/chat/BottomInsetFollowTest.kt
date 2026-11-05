package me.meeshy.app.chat

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.runtime.snapshots.Snapshot
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import com.google.common.truth.Truth.assertThat
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/**
 * La réserve basse du fil rejoint sa cible sur la courbe de l'appelant : jamais d'un saut quand
 * seul le composeur grandit, et image par image quand le clavier annonce ses propres insets.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class BottomInsetFollowTest {

    @get:Rule
    val compose = createComposeRule()

    private var target by mutableStateOf(100.dp)
    private var observed: Dp = 0.dp

    private fun show(keyboard: ComposerKeyboardState) {
        compose.mainClock.autoAdvance = false
        compose.setContent { observed = rememberKeyboardFollowingInset(target, keyboard) }
        compose.mainClock.advanceTimeBy(1_000)
    }

    /**
     * Le composeur grandit : la nouvelle cible est APPLIQUÉE d'un bloc, comme le fait l'image suivante dans l'appli.
     * Horloge figée, rien ne pompe la boucle principale où `GlobalSnapshotManager` applique une écriture globale :
     * sans application, la recomposition ne voit jamais la cible changer et le témoin lit 100 dp à mi-course
     * (même règle que `HeaderFlameReplayTest`). Cet échec précédait, dans le même processus, une cascade
     * d'AppNotIdleException sur tous les témoins Compose suivants du module.
     */
    private fun grow(to: Dp) {
        Snapshot.withMutableSnapshot { target = to }
    }

    @Test
    fun `le composeur qui grandit est suivi en plusieurs etapes`() {
        show(ComposerKeyboardState())
        assertThat(observed).isEqualTo(100.dp)

        grow(to = 200.dp)
        compose.mainClock.advanceTimeBy(ChatScrollGeometry.COMPOSER_INSET_MS / 2L)
        val midway = observed

        assertThat(midway.value).isGreaterThan(100f)
        assertThat(midway.value).isLessThan(200f)
        compose.mainClock.advanceTimeBy(1_000)
        assertThat(observed).isEqualTo(200.dp)
    }
}
