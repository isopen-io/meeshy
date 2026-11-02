package me.meeshy.app.onboarding

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.runtime.snapshots.Snapshot
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithTag
import org.robolectric.RuntimeEnvironment
import android.content.Context
import com.google.common.truth.Truth.assertThat
import me.meeshy.feature.auth.R
import me.meeshy.ui.theme.MeeshyTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class OnboardingPointsChipTest {

    @get:Rule
    val compose = createComposeRule()

    private val context: Context = RuntimeEnvironment.getApplication()

    private fun plural(id: Int, n: Int) = context.resources.getQuantityString(id, n, n)

    private class Spy {
        val announcements = mutableListOf<String>()
        var haptics = 0
    }

    @Test
    fun `la pastille se dit au lecteur d'ecran avec les points de la session`() {
        compose.setContent { MeeshyTheme { OnboardingPointsChip(points = 7, bump = false) } }

        compose.onNodeWithContentDescription(plural(R.plurals.onboarding_points_a11y, 7)).assertExists()
    }

    @Test
    fun `un gain est annonce une fois avec son haptique de succes`() {
        val spy = Spy()
        var reward by mutableStateOf<OnboardingReward?>(null)
        compose.setContent {
            MeeshyTheme {
                OnboardingPointsCelebration(
                    points = 5, reward = reward, reduceMotion = false,
                    announce = { spy.announcements += it }, onSuccessHaptic = { spy.haptics++ },
                )
            }
        }

        reward = OnboardingReward(id = 1, points = 5)
        Snapshot.sendApplyNotifications()
        compose.mainClock.advanceTimeBy(100)

        assertThat(spy.announcements).containsExactly(plural(R.plurals.onboarding_reward_announce, 5))
        assertThat(spy.haptics).isEqualTo(1)
    }

    @Test
    fun `le plus N vole puis disparait et la pastille retrouve son etat final`() {
        var reward by mutableStateOf<OnboardingReward?>(null)
        compose.setContent {
            MeeshyTheme {
                OnboardingPointsCelebration(
                    points = 5, reward = reward, reduceMotion = false, announce = {}, onSuccessHaptic = {},
                )
            }
        }
        compose.onNodeWithTag(ONBOARDING_REWARD_FLIGHT_TAG, useUnmergedTree = true).assertDoesNotExist()

        reward = OnboardingReward(id = 1, points = 5)
        Snapshot.sendApplyNotifications()
        compose.mainClock.advanceTimeBy(100)
        compose.onNodeWithTag(ONBOARDING_REWARD_FLIGHT_TAG, useUnmergedTree = true).assertExists()

        compose.mainClock.advanceTimeBy(3_000)
        compose.onNodeWithTag(ONBOARDING_REWARD_FLIGHT_TAG, useUnmergedTree = true).assertDoesNotExist()
        compose.onNodeWithContentDescription(plural(R.plurals.onboarding_points_a11y, 5)).assertExists()
    }

    @Test
    fun `sous animations reduites le gain reste visible plus longtemps sans rebond`() {
        var reward by mutableStateOf<OnboardingReward?>(null)
        compose.setContent {
            MeeshyTheme {
                OnboardingPointsCelebration(
                    points = 5, reward = reward, reduceMotion = true, announce = {}, onSuccessHaptic = {},
                )
            }
        }

        reward = OnboardingReward(id = 1, points = 5)
        Snapshot.sendApplyNotifications()
        compose.mainClock.advanceTimeBy(1_500)
        compose.onNodeWithTag(ONBOARDING_REWARD_FLIGHT_TAG, useUnmergedTree = true).assertExists()

        compose.mainClock.advanceTimeBy(1_000)
        compose.onNodeWithTag(ONBOARDING_REWARD_FLIGHT_TAG, useUnmergedTree = true).assertDoesNotExist()
    }

    @Test
    fun `deux gains identiques se celebrent deux fois`() {
        val spy = Spy()
        var reward by mutableStateOf<OnboardingReward?>(null)
        compose.setContent {
            MeeshyTheme {
                OnboardingPointsCelebration(
                    points = 5, reward = reward, reduceMotion = false,
                    announce = { spy.announcements += it }, onSuccessHaptic = { spy.haptics++ },
                )
            }
        }

        reward = OnboardingReward(id = 1, points = 5)
        Snapshot.sendApplyNotifications()
        compose.mainClock.advanceTimeBy(3_000)
        reward = OnboardingReward(id = 2, points = 5)
        Snapshot.sendApplyNotifications()
        compose.mainClock.advanceTimeBy(100)

        assertThat(spy.announcements).hasSize(2)
        assertThat(spy.haptics).isEqualTo(2)
    }
}
