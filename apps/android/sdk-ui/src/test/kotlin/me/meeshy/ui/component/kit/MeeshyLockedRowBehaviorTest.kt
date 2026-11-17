package me.meeshy.ui.component.kit

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.test.junit4.createComposeRule
import com.google.common.truth.Truth.assertThat
import me.meeshy.ui.theme.MeeshyTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/**
 * K37 — la rangée verrouillée rendue : l'ouverture se joue une fois PAR DEMANDE de l'hôte, prévient l'hôte quand elle a fini
 * de se jouer (jumeau d'`onUnlocked`, iOS), et une demande retirée puis reposée se rejoue.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class MeeshyLockedRowBehaviorTest {

    @get:Rule
    val compose = createComposeRule()

    @Test
    fun `l'ouverture previent l'hote une fois jouee, et se rejoue apres un retrait de l'acces`() {
        var unlocking by mutableStateOf(false)
        var played = 0
        compose.mainClock.autoAdvance = false
        compose.setContent {
            MeeshyTheme(darkTheme = false) {
                MeeshyLockedRow(title = "Présence", requirement = "dès Ami", isUnlocking = unlocking, onUnlocked = { played++ })
            }
        }

        unlocking = true
        compose.mainClock.advanceTimeBy(1_000)
        assertThat(played).isEqualTo(1)

        unlocking = false
        compose.mainClock.advanceTimeBy(1_000)
        unlocking = true
        compose.mainClock.advanceTimeBy(1_000)
        assertThat(played).isEqualTo(2)
    }

    @Test
    fun `une demande retiree avant la fin du fondu ne previent pas l'hote`() {
        var unlocking by mutableStateOf(false)
        var played = 0
        compose.mainClock.autoAdvance = false
        compose.setContent {
            MeeshyTheme(darkTheme = false) {
                MeeshyLockedRow(title = "Présence", requirement = "dès Ami", isUnlocking = unlocking, onUnlocked = { played++ })
            }
        }

        unlocking = true
        compose.mainClock.advanceTimeBy(100)
        unlocking = false
        compose.mainClock.advanceTimeBy(1_000)

        assertThat(played).isEqualTo(0)
    }
}
